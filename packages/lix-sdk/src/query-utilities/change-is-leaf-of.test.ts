import { test, expect } from "vitest";
import { changeIsLeafOf } from "./change-is-leaf-of.js";
import { openLixInMemory } from "../lix/open-lix-in-memory.js";
import type { Change, ChangeGraphEdge } from "../database/schema.js";
import { updateBranchPointers } from "../branch/update-branch-pointers.js";

test("it should find the latest child of a given change", async () => {
	const lix = await openLixInMemory({});

	const currentBranch = await lix.db
		.selectFrom("current_branch")
		.innerJoin("branch", "current_branch.id", "branch.id")
		.selectAll("branch")
		.executeTakeFirstOrThrow();

	const mockChanges = [
		{
			id: "1",
			entity_id: "value1",
			file_id: "mock",
			plugin_key: "mock",
			schema_key: "mock",
			snapshot_id: "no-content",
			created_at: "mock",
		},
		{
			id: "2",
			entity_id: "value1",
			file_id: "mock",
			plugin_key: "mock",
			schema_key: "mock",
			snapshot_id: "no-content",
			created_at: "mock",
		},
		{
			id: "3",
			entity_id: "value1",
			file_id: "mock",
			plugin_key: "mock",
			schema_key: "mock",
			snapshot_id: "no-content",
			created_at: "mock",
		},
	] as const satisfies Change[];

	const edges: ChangeGraphEdge[] = [
		{ parent_id: "1", child_id: "2" },
		{ parent_id: "2", child_id: "3" },
	];

	await lix.db.insertInto("change").values(mockChanges).execute();

	await lix.db.insertInto("change_edge").values(edges).execute();

	await updateBranchPointers({
		lix,
		branch: currentBranch,
		changes: mockChanges,
	});

	const leafOfChange1 = await lix.db
		.selectFrom("change")
		.where(changeIsLeafOf(mockChanges[0]))
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(leafOfChange1.id).toBe("3");

	const leafOfChange2 = await lix.db
		.selectFrom("change")
		.where(changeIsLeafOf(mockChanges[1]))
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(leafOfChange2.id).toBe("3");

	const leafOfChange3 = await lix.db
		.selectFrom("change")
		.where(changeIsLeafOf(mockChanges[2]))
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(leafOfChange3.id).toBe("3");
});
