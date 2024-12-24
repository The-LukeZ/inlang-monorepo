import { compileBundle, type Resource } from "./compileBundle.js";
import { jsIdentifier } from "../services/codegen/identifier.js";
import { createRuntime } from "./runtime.js";
import { createRegistry, DEFAULT_REGISTRY } from "./registry.js";
import { lookup } from "~/services/lookup.js";
import { type BundleNested, type ProjectSettings } from "@inlang/sdk";
import * as prettier from "prettier";
import { escapeForSingleQuoteString } from "~/services/codegen/escape.js";

const ignoreDirectory = `# ignore everything because the directory is auto-generated by inlang paraglide-js
# for more info visit https://inlang.com/m/gerre34r/paraglide-js
*
`;

export type CompileOptions = {
	bundles: Readonly<BundleNested[]>;
	settings: Pick<ProjectSettings, "baseLocale" | "locales">;
	/**
	 * The file-structure of the compiled output.
	 *
	 * @default "regular"
	 */
	outputStructure?: "regular" | "message-modules";
};

const defaultCompileOptions = {
	outputStructure: "regular",
} satisfies Partial<CompileOptions>;

/**
 * A compile function takes a list of messages and project settings and returns
 * a map of file names to file contents.
 *
 * @example
 *   const output = compile({ messages, settings })
 *   console.log(output)
 *   >> { "messages.js": "...", "runtime.js": "..." }
 */
export const compile = async (
	args: CompileOptions
): Promise<Record<string, string>> => {
	const opts = {
		...defaultCompileOptions,
		...args,
	};

	//Maps each language to it's fallback
	//If there is no fallback, it will be undefined
	const fallbackMap = getFallbackMap(
		opts.settings.locales,
		opts.settings.baseLocale
	);
	const resources = opts.bundles.map((bundle) =>
		compileBundle({
			bundle,
			fallbackMap,
			registry: DEFAULT_REGISTRY,
		})
	);

	const output =
		opts.outputStructure === "regular"
			? generateRegularOutput(resources, opts.settings, fallbackMap)
			: generateModuleOutput(resources, opts.settings, fallbackMap);

	// // telemetry
	// const pkgJson = await getPackageJson(fs, process.cwd())
	// const stack = getStackInfo(pkgJson)
	// telemetry.capture(
	// 	{
	// 		event: "PARAGLIDE-JS compile executed",
	// 		properties: { stack },
	// 	},
	// 	opts.projectId
	// )

	// telemetry.shutdown()
	return await formatFiles(output);
};

function generateRegularOutput(
	resources: Resource[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>
): Record<string, string> {
	const indexFile = [
		"/* eslint-disable */",
		'import { getLocale } from "./runtime.js"',
		settings.locales
			.map(
				(locale) =>
					`import * as ${jsIdentifier(locale)} from "./messages/${locale}.js"`
			)
			.join("\n"),
		resources.map(({ bundle }) => bundle.code).join("\n"),
	].join("\n");

	const output: Record<string, string> = {
		".prettierignore": ignoreDirectory,
		".gitignore": ignoreDirectory,
		"runtime.js": createRuntime(settings),
		"registry.js": createRegistry(),
		"messages.js": indexFile,
	};

	// generate message files
	for (const locale of settings.locales) {
		const filename = `messages/${locale}.js`;
		let file = `
/* eslint-disable */ 
/** 
 * This file contains language specific functions for tree-shaking. 
 * 
 *! WARNING: Only import from this file if you want to manually
 *! optimize your bundle. Else, import from the \`messages.js\` file. 
 */
import * as registry from '../registry.js'`;

		for (const resource of resources) {
			const compiledMessage = resource.messages[locale];
			const id = jsIdentifier(resource.bundle.node.id);
			if (!compiledMessage) {
				const fallbackLocale = fallbackMap[locale];
				if (fallbackLocale) {
					// use the fall back locale e.g. render the message in English if the German message is missing
					file += `\nexport { ${id} } from "./${fallbackLocale}.js"`;
				} else {
					// no fallback exists, render the bundleId
					file += `\nexport const ${id} = () => '${id}'`;
				}
				continue;
			}

			file += `\n\n${compiledMessage.code}`;
		}

		output[filename] = file;
	}
	return output;
}

function generateModuleOutput(
	resources: Resource[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>
): Record<string, string> {
	const output: Record<string, string> = {
		".prettierignore": ignoreDirectory,
		".gitignore": ignoreDirectory,
		"runtime.js": createRuntime(settings),
		"registry.js": createRegistry(),
	};

	// index messages
	output["messages.js"] = [
		"/* eslint-disable */",
		...resources.map(
			({ bundle }) => `export * from './messages/index/${bundle.node.id}.js'`
		),
	].join("\n");

	for (const resource of resources) {
		const filename = `messages/index/${resource.bundle.node.id}.js`;
		const code = [
			"/* eslint-disable */",
			"import * as registry from '../../registry.js'",
			settings.locales
				.map(
					(locale) =>
						`import * as ${jsIdentifier(locale)} from "../${locale}.js"`
				)
				.join("\n"),
			"import { languageTag } from '../../runtime.js'",
			"",
			resource.bundle.code,
		].join("\n");
		output[filename] = code;
	}

	// generate locales
	for (const locale of settings.locales) {
		const messageIndexFile = [
			"/* eslint-disable */",
			...resources.map(
				({ bundle }) => `export * from './${locale}/${bundle.node.id}.js'`
			),
		].join("\n");
		output[`messages/${locale}.js`] = messageIndexFile;

		// generate individual message files
		for (const resource of resources) {
			let file = [
				"/* eslint-disable */",
				"import * as registry from '../../registry.js' ",
			].join("\n");

			const compiledMessage = resource.messages[locale];
			const id = jsIdentifier(resource.bundle.node.id);
			if (!compiledMessage) {
				// add fallback
				const fallbackLocale = fallbackMap[locale];
				if (fallbackLocale) {
					file += `\nexport { ${id} } from "../${fallbackLocale}.js"`;
				} else {
					file += `\nexport const ${id} = () => '${escapeForSingleQuoteString(
						resource.bundle.node.id
					)}'`;
				}
			} else {
				file += `\n${compiledMessage.code}`;
			}

			output[`messages/${locale}/${resource.bundle.node.id}.js`] = file;
		}
	}
	return output;
}

async function formatFiles(
	files: Record<string, string>
): Promise<Record<string, string>> {
	const output: Record<string, string> = {};
	const promises: Promise<void>[] = [];

	for (const [key, value] of Object.entries(files)) {
		if (!key.endsWith(".js")) {
			output[key] = value;
			continue;
		}

		promises.push(
			new Promise((resolve, reject) => {
				fmt(value)
					.then((formatted) => {
						output[key] = formatted;
						resolve();
					})
					.catch(reject);
			})
		);
	}

	await Promise.all(promises);
	return output;
}

async function fmt(js: string): Promise<string> {
	return await prettier.format(js, {
		arrowParens: "always",
		singleQuote: true,
		printWidth: 100,
		parser: "babel",
		plugins: ["prettier-plugin-jsdoc"],
	});
}

export function getFallbackMap<T extends string>(
	locales: T[],
	baseLocale: NoInfer<T>
): Record<T, T | undefined> {
	return Object.fromEntries(
		locales.map((lang) => {
			const fallbackLanguage = lookup(lang, {
				locales: locales.filter((l) => l !== lang),
				baseLocale,
			});

			if (lang === fallbackLanguage) return [lang, undefined];
			else return [lang, fallbackLanguage];
		})
	) as Record<T, T | undefined>;
}
