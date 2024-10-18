/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import type { LixPlugin } from "../plugin.js";

export type LixDatabaseSchema = {
	file: LixFileTable;
	change: ChangeTable;
	file_internal: LixFileTable;
	change_queue: ChangeQueueTable;
	change_edge: ChangeEdgeTable;
	conflict: ConflictTable;
	snapshot: SnapshotTable;

	// discussion
	discussion: DiscussionTable;
	comment: CommentTable;
	discussion_change_map: DiscussionChangeMapTable;
};

export type ChangeQueueEntry = Selectable<ChangeQueueTable>;
export type NewChangeQueueEntry = Insertable<ChangeQueueTable>;
export type ChangeQueueEntryUpdate = Updateable<ChangeQueueTable>;
type ChangeQueueTable = {
	id: Generated<number>;
	path: string;
	file_id: LixFileTable["id"];
	metadata: Record<string, any> | null;
	data: ArrayBuffer;
};

// named lix file to avoid conflict with built-in file type
export type LixFile = Selectable<LixFileTable>;
export type NewLixFile = Insertable<LixFileTable>;
export type LixFileUpdate = Updateable<LixFileTable>;
type LixFileTable = {
	id: Generated<string>;
	path: string;
	data: ArrayBuffer;
	metadata: Record<string, any> | null;
};

export type Change = Selectable<ChangeTable>;
export type NewChange = Insertable<ChangeTable>;
type ChangeTable = {
	id: Generated<string>;
	/**
	 * The entity the change refers to.
	 */
	entity_id: string;
	file_id: string;
	/**
	 * The plugin key that contributed the change.
	 *
	 * Exists to ease querying for changes by plugin,
	 * in case the user changes the plugin configuration.
	 */
	plugin_key: LixPlugin["key"];
	/**
	 * The type of change that was made.
	 *
	 * @example
	 *   - "cell" for csv cell change
	 *   - "message" for inlang message change
	 *   - "user" for a user change
	 */
	type: string;
	snapshot_id: string;
	/**
	 * The time the change was created.
	 */
	created_at: Generated<string>;
};

export type ChangeEdge = Selectable<ChangeEdgeTable>;
export type NewChangeEdge = Insertable<ChangeEdgeTable>;
type ChangeEdgeTable = {
	parent_id: ChangeTable["id"];
	child_id: ChangeTable["id"];
};

export type Snapshot = Selectable<SnapshotTable>;
export type NewSnapshot = Insertable<SnapshotTable>;
type SnapshotTable = {
	id: Generated<string>;
	/**
	 * The value of the change.
	 *
	 * Lix interprets an undefined value as delete operation.
	 *
	 * @example
	 *   - For a csv cell change, the value would be the new cell value.
	 *   - For an inlang message change, the value would be the new message.
	 */
	value?: Record<string, any>;
};

// TODO #185 rename value to snapshot_value
export type ChangeWithSnapshot = Change & { value: SnapshotTable["value"] };
export type NewChangeWithSnapshot = NewChange & {
	value: SnapshotTable["value"];
};

export type Conflict = Selectable<ConflictTable>;
export type NewConflict = Insertable<ConflictTable>;
export type ConflictUpdate = Updateable<ConflictTable>;
type ConflictTable = {
	meta?: Record<string, any>;
	reason?: string;
	change_id: ChangeTable["id"];
	conflicting_change_id: ChangeTable["id"];
	/**
	 * The change id that the conflict was resolved with.
	 *
	 * Can be the change_id, conflicting_change_id, or another change_id
	 * that resulted from a merge.
	 */
	resolved_change_id?: ChangeTable["id"];
};

// ------ discussions ------

export type Discussion = Selectable<DiscussionTable>;
export type NewDiscussion = Insertable<DiscussionTable>;
export type DiscussionUpdate = Updateable<DiscussionTable>;
type DiscussionTable = {
	id: Generated<string>;
};

export type DiscussionChangeMap = Selectable<DiscussionChangeMapTable>;
export type NewDiscussionChangeMap = Insertable<DiscussionChangeMapTable>;
export type DiscussionChangeMapUpdate = Updateable<DiscussionChangeMapTable>;
type DiscussionChangeMapTable = {
	change_id: string;
	discussion_id: string;
};

export type Comment = Selectable<CommentTable>;
export type NewComment = Insertable<CommentTable>;
export type CommentUpdate = Updateable<CommentTable>;
type CommentTable = {
	id: Generated<string>;
	parent_id?: string;
	discussion_id: string;
	created_at: Generated<string>;
	body: string;
};
