import assert from "node:assert/strict";
import test from "node:test";
import {
	PREPENDED_FIRST_ITEM_INDEX_BASE,
	createPrependedFirstItemIndexState,
	nextPrependedFirstItemIndexState,
} from "../dist/session-ui/prependedFirstItemIndex.js";

function advance(state, itemIds, resetKey = "session-a") {
	return nextPrependedFirstItemIndexState(state, itemIds, resetKey);
}

test("prepended first item index keeps streaming appends anchored", () => {
	let state = createPrependedFirstItemIndexState();
	state = advance(state, ["row-3", "row-4"]);
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE);

	state = advance(state, ["row-3", "row-4", "row-5"]);
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE);

	state = advance(state, ["row-3", "row-4", "row-5", "streaming-row"]);
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE);
});

test("prepended first item index compensates only for rows inserted before the previous first row", () => {
	let state = createPrependedFirstItemIndexState();
	state = advance(state, ["row-5", "row-6"]);

	state = advance(state, ["row-3", "row-4", "row-5", "row-6"]);
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE - 2);

	state = advance(state, ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"]);
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE - 4);
});

test("prepended first item index resets when the anchor or session changes", () => {
	let state = createPrependedFirstItemIndexState();
	state = advance(state, ["row-5", "row-6"], "session-a");
	state = advance(state, ["row-3", "row-4", "row-5", "row-6"], "session-a");
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE - 2);

	state = advance(state, ["other-1", "other-2"], "session-a");
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE);

	state = advance(state, ["row-1", "row-2"], "session-b");
	assert.equal(state.firstItemIndex, PREPENDED_FIRST_ITEM_INDEX_BASE);
});

test("prepended first item index does not underflow", () => {
	let state = createPrependedFirstItemIndexState(3);
	state = nextPrependedFirstItemIndexState(state, ["row-5"], "session-a", 3);
	state = nextPrependedFirstItemIndexState(state, ["row-1", "row-2", "row-3", "row-4", "row-5"], "session-a", 3);
	assert.equal(state.firstItemIndex, 1);
});
