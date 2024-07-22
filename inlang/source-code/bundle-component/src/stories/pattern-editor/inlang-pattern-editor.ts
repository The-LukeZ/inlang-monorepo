import type { Pattern } from "@inlang/sdk-v2"
import { LitElement, css, html } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { ref, createRef, type Ref } from "lit/directives/ref.js"
import { createEditor } from "lexical"
import { registerPlainText } from "@lexical/plain-text"
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical"
import patternToString from "../../helper/crud/pattern/patternToString.js"
import stringToPattern from "../../helper/crud/pattern/stringToPattern.js"

//editor config
const config = {
	namespace: "MyEditor",
	onError: console.error,
}

@customElement("inlang-pattern-editor")
export default class InlangPatternEditor extends LitElement {
	static override styles = [
		css`
			.editor-wrapper {
				background-color: #f0f0f0;
			}
		`,
	]

	// refs
	contentEditableElementRef: Ref<HTMLDivElement> = createRef()

	// props
	@property({ type: Array })
	pattern: Pattern | undefined

	//state
	@state()
	_editorTextContent: string = ""

	// dispatch `change-pattern` event with the new pattern
	dispatchOnChangePattern(pattern: Pattern) {
		const onChangePattern = new CustomEvent("change-pattern", {
			detail: {
				argument: pattern,
			},
		})
		this.dispatchEvent(onChangePattern)
	}

	//disable shadow root -> because of contenteditable selection API
	override createRenderRoot() {
		return this
	}

	// create editor
	editor = createEditor(config)

	// update editor when pattern changes
	override updated(changedProperties: Map<string | number | symbol, unknown>) {
		if (
			changedProperties.has("pattern") &&
			patternToString({ pattern: this.pattern! }) !== this._editorTextContent
		) {
			this._setEditorState()
		}
	}

	// set editor state
	private _setEditorState = () => {
		// only handling strings so far -> TODO: handle real patterns
		this.editor.update(() => {
			const root = $getRoot()
			if (root.getChildren().length === 0) {
				const paragraphNode = $createParagraphNode()
				const textNode = $createTextNode(
					this.pattern ? patternToString({ pattern: this.pattern }) : ""
				)
				paragraphNode.append(textNode)
				root.append(paragraphNode)
			} else {
				const paragraphNode = root.getChildren()[0]!
				paragraphNode.remove()
				const newpParagraphNode = $createParagraphNode()
				const textNode = $createTextNode(
					this.pattern ? patternToString({ pattern: this.pattern }) : ""
				)
				newpParagraphNode.append(textNode)
				root.append(newpParagraphNode)
			}
		})
	}

	override async firstUpdated() {
		const contentEditableElement = this.contentEditableElementRef.value
		if (contentEditableElement) {
			// set root element of editor and register plain text
			this.editor.setRootElement(contentEditableElement)
			registerPlainText(this.editor)

			// listen to text content changes and dispatch `change-pattern` event
			this.editor.registerTextContentListener((textContent) => {
				// The latest text content of the editor!

				//check if something changed
				this.dispatchOnChangePattern(stringToPattern({ text: textContent }))
				this._editorTextContent = textContent
			})
		}
	}

	override render() {
		return html`
			<style>
				div {
					box-sizing: border-box;
					font-size: 13px;
				}
				p {
					margin: 0;
				}
				inlang-pattern-editor {
					width: 100%;
				}
				.inlang-pattern-editor-wrapper {
					min-height: 44px;
					width: 100%;
					position: relative;
				}
				.inlang-pattern-editor-wrapper:focus-within {
					z-index: 1;
				}
				.inlang-pattern-editor-contenteditable {
					background-color: #ffffff;
					padding: 14px 12px;
					min-height: 44px;
					width: 100%;
					color: #242424;
					outline: none;
				}
				.inlang-pattern-editor-contenteditable:focus {
					box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);
				}
				.inlang-pattern-editor-contenteditable:hover {
					background-color: #f9f9f9;
					color: #000;
				}
				.inlang-pattern-editor-placeholder {
					opacity: 0.5;
					position: absolute;
					top: 14px;
					left: 12px;
					font-size: 13px;
					font-weight: 500;
					pointer-events: none;
					font-family: var(--sl-font-sans);
				}
			</style>
			<div class="inlang-pattern-editor-wrapper">
				<div
					class="inlang-pattern-editor-contenteditable"
					contenteditable
					${ref(this.contentEditableElementRef)}
				></div>
				${this._editorTextContent === ""
					? html`<p class="inlang-pattern-editor-placeholder">Enter pattern ...</p>`
					: ""}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-pattern-editor": InlangPatternEditor
	}
}
