import { createInMemoryDatabase } from "sqlite-wasm-kysely";
import { test, expect } from "vitest";
import { initDb } from "./initDb.js";
import { validate } from "uuid";

test("file ids should default to uuid", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const file = await db
		.insertInto("file_internal")
		.values({ path: "/mock", data: new Uint8Array() })
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(validate(file.id)).toBe(true);
});

test("change ids should default to uuid", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const change = await db
		.insertInto("change")
		.values({
			type: "file",
			entity_id: "value1",
			file_id: "mock",
			plugin_key: "mock-plugin",
			snapshot_id: "sn1",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(validate(change.id)).toBe(true);
});

test("snapshot ids should default to sha256", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });
	const snapshot = await db
		.insertInto("snapshot")
		.values({
			content: { a: "value from insert statement" },
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(snapshot.id).toBe(
		"19ce22178013c4a047e8c90135ed57bfe4cc6451917dbb75f5b838922cf10b19",
	);
});

test("an empty snapshot should default to the special 'no-content' snapshot to store disk space", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });
	const snapshot = await db
		.insertInto("snapshot")
		.values({
			content: null,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(snapshot.id).toBe("no-content");
});

// https://github.com/opral/lix-sdk/issues/71
test("files should be able to have metadata", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const file = await db
		.insertInto("file_internal")
		.values({
			path: "/mock.csv",
			data: new Uint8Array(),
			metadata: {
				primary_key: "email",
			},
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(file.metadata?.primary_key).toBe("email");

	const updatedFile = await db
		.updateTable("file_internal")
		.where("path", "=", "/mock.csv")
		.set({
			metadata: {
				primary_key: "something-else",
			},
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(updatedFile.metadata?.primary_key).toBe("something-else");
});

test("change graph edges can't reference themselves", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	await expect(
		db
			.insertInto("change_graph_edge")
			.values({
				parent_id: "change1",
				child_id: "change1",
			})
			.returningAll()
			.execute(),
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[SQLite3Error: SQLITE_CONSTRAINT_CHECK: sqlite3 result code 275: CHECK constraint failed: parent_id != child_id]`,
	);
});

test("change set items must be unique", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	await db
		.insertInto("change_set")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	await db
		.insertInto("change_set_element")
		.values({
			change_set_id: "change-set-1",
			change_id: "change-1",
		})
		.execute();

	await expect(
		db
			.insertInto("change_set_element")
			.values({
				change_set_id: "change-set-1",
				change_id: "change-1",
			})
			.returningAll()
			.execute(),
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[SQLite3Error: SQLITE_CONSTRAINT_UNIQUE: sqlite3 result code 2067: UNIQUE constraint failed: change_set_element.change_set_id, change_set_element.change_id]`,
	);
});

test("creating multiple discussions for one change set should be possible", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const changeSet = await db
		.insertInto("change_set")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	await db
		.insertInto("discussion")
		.values([
			{ id: "discussion-1", change_set_id: changeSet.id },
			{ id: "discussion-2", change_set_id: changeSet.id },
		])
		.returningAll()
		.execute();

	const discussions = await db
		.selectFrom("discussion")
		.selectAll()
		.where("change_set_id", "=", changeSet.id)
		.execute();

	expect(discussions).toHaveLength(2);
});

test("the confirmed label should be created if it doesn't exist", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const tag = await db
		.selectFrom("label")
		.selectAll()
		.where("name", "=", "confirmed")
		.executeTakeFirst();

	expect(tag).toMatchObject({
		name: "confirmed",
	});
});

test("a default main branch should exist", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	const branch = await db
		.selectFrom("branch")
		.selectAll()
		.where("name", "=", "main")
		.executeTakeFirst();

	expect(branch).toBeDefined();
});


test("conflicts should not be able to reference themselves", async () => {
	const sqlite = await createInMemoryDatabase({
		readOnly: false,
	});
	const db = initDb({ sqlite });

	expect(
		db
			.insertInto("conflict")
			.values({
				change_id: "change1",
				conflicting_change_id: "change1",
			})
			.returningAll()
			.execute(),
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[SQLite3Error: SQLITE_CONSTRAINT_CHECK: sqlite3 result code 275: CHECK constraint failed: change_id != conflicting_change_id]`,
	);
});