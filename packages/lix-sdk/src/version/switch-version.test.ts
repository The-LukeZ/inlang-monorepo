import { test, expect, vi } from "vitest";
import { openLixInMemory } from "../lix/open-lix-in-memory.js";
import { switchVersion } from "./switch-version.js";
import { createVersion } from "./create-version.js";
import { createChange } from "../change/create-change.js";
import type { LixPlugin } from "../plugin/lix-plugin.js";
import { changeQueueSettled } from "../change-queue/change-queue-settled.js";

test("switching versiones should update the current_version", async () => {
	const lix = await openLixInMemory({});

	const currentVersion = await lix.db
		.selectFrom("current_version")
		.innerJoin("version", "current_version.id", "version.id")
		.selectAll("version")
		.executeTakeFirstOrThrow();

	const newVersion = await lix.db.transaction().execute(async (trx) => {
		const newVersion = await createVersion({
			lix: { db: trx },
			parent: currentVersion,
		});
		await switchVersion({ lix: { ...lix, db: trx }, to: newVersion });
		return newVersion;
	});

	const currentVersionAfterSwitch = await lix.db
		.selectFrom("current_version")
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(currentVersionAfterSwitch.id).toBe(newVersion?.id);
});

test("switching a version does not lead to duplicate changes", async () => {
	const lix = await openLixInMemory({});

	const account0 = await lix.db
		.insertInto("account")
		.values({ name: "account0" })
		.returningAll()
		.executeTakeFirstOrThrow();

	const currentVersion = await lix.db
		.selectFrom("current_version")
		.innerJoin("version", "current_version.id", "version.id")
		.selectAll("version")
		.executeTakeFirstOrThrow();

	const change0 = await createChange({
		lix,
		version: currentVersion,
		authors: [account0],
		entityId: "entity0",
		fileId: "file0",
		schemaKey: "schema0",
		snapshotContent: null,
		pluginKey: "plugin0",
	});

	const newVersion = await createVersion({
		lix: lix,
		parent: currentVersion,
	});

	const changesBefore = await lix.db.selectFrom("change").selectAll().execute();

	expect(changesBefore).toEqual(expect.arrayContaining([change0]));

	await switchVersion({ lix, to: newVersion });

	const changesAfter = await lix.db.selectFrom("change").selectAll().execute();

	expect(changesAfter).toEqual(changesBefore);
});

test("switch version applies the changes of the switched to version", async () => {
	const lix = await openLixInMemory({});

	const versionA = await createVersion({ lix });

	const versionB = await createVersion({ lix });

	await switchVersion({ lix, to: versionA });

	// version A has value foo
	await lix.db
		.insertInto("key_value")
		.values({ key: "foo", value: "bar" })
		.execute();

	let keyValues = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "foo")
		.selectAll()
		.execute();

	expect(keyValues).toEqual([{ key: "foo", value: "bar" }]);

	await switchVersion({ lix, to: versionB });

	// version B should have no value foo
	keyValues = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "foo")
		.selectAll()
		.execute();

	expect(keyValues).toHaveLength(0);

	// version B has value foo
	await lix.db
		.insertInto("key_value")
		.values({ key: "foo", value: "baz" })
		.execute();

	await switchVersion({ lix, to: versionA });

	keyValues = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "foo")
		.selectAll()
		.execute();

	// expecting to see the value from version A again
	expect(keyValues).toEqual([{ key: "foo", value: "bar" }]);
});

// https://github.com/opral/lix-sdk/issues/209
test("a deleted file in one version does not impact a version which did not delete the file", async () => {
	const mockTxtPlugin: LixPlugin = {
		key: "mock_txt_plugin",
		detectChangesGlob: "*.txt",
		// @ts-expect-error - mocked
		detectChanges: vi.fn(async ({ after }) => {
			return [
				{
					entity_id: "txt_file",
					snapshot: after
						? {
								text: new TextDecoder().decode(after?.data),
							}
						: null,
					schema: {
						type: "json",
						key: "txt",
					},
				},
			];
		}),

		applyChanges: vi.fn(async ({ lix, changes }) => {
			const snapshot = await lix.db
				.selectFrom("snapshot")
				.where("id", "=", changes.at(-1)!.snapshot_id)
				.selectAll()
				.executeTakeFirstOrThrow();

			return {
				fileData: new TextEncoder().encode(snapshot.content!.text),
			};
		}),
	};

	const lix = await openLixInMemory({ providePlugins: [mockTxtPlugin] });

	const sourceVersion = await createVersion({ lix });

	await switchVersion({ lix, to: sourceVersion });

	await lix.db
		.insertInto("file")
		.values({
			id: "file0",
			data: new TextEncoder().encode("hello world"),
			path: "/file.txt",
		})
		.execute();

	await changeQueueSettled({ lix });

	expect(mockTxtPlugin.detectChanges).toHaveBeenCalledTimes(1);

	const targetVersion = await createVersion({ lix, parent: sourceVersion });

	await switchVersion({ lix, to: targetVersion });

	// there is no difference in both versions
	expect(mockTxtPlugin.applyChanges).toHaveBeenCalledTimes(0);

	// deleting the file in the target version
	await lix.db.deleteFrom("file").where("id", "=", "file0").execute();

	await changeQueueSettled({ lix });

	expect(mockTxtPlugin.detectChanges).toHaveBeenCalledTimes(2);

	// switching back to the source version
	await switchVersion({ lix, to: sourceVersion });

	// the plugin re-applies the changes
	expect(mockTxtPlugin.applyChanges).toHaveBeenCalledTimes(1);

	// the file should still be there

	const file = await lix.db
		.selectFrom("file")
		.where("id", "=", "file0")
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(file.data).toEqual(new TextEncoder().encode("hello world"));
});
