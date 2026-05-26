export const PREPENDED_FIRST_ITEM_INDEX_BASE = 1_000_000;

export type PrependedFirstItemIndexState = {
	resetKey: string | undefined;
	firstItemIndex: number;
	itemIds: readonly string[];
};

export function createPrependedFirstItemIndexState(
	firstItemIndex = PREPENDED_FIRST_ITEM_INDEX_BASE,
): PrependedFirstItemIndexState {
	return {
		resetKey: undefined,
		firstItemIndex,
		itemIds: [],
	};
}

export function nextPrependedFirstItemIndexState(
	state: PrependedFirstItemIndexState,
	itemIds: readonly string[],
	resetKey: string | undefined,
	baseIndex = PREPENDED_FIRST_ITEM_INDEX_BASE,
): PrependedFirstItemIndexState {
	if (state.resetKey !== resetKey) {
		return {
			resetKey,
			firstItemIndex: baseIndex,
			itemIds: [...itemIds],
		};
	}

	let firstItemIndex = state.firstItemIndex;
	if (state.itemIds.length && itemIds.length) {
		const previousFirstIndex = itemIds.indexOf(state.itemIds[0]);
		if (previousFirstIndex > 0) {
			firstItemIndex = Math.max(1, firstItemIndex - previousFirstIndex);
		} else if (previousFirstIndex === -1) {
			firstItemIndex = baseIndex;
		}
	}

	return {
		resetKey,
		firstItemIndex,
		itemIds: [...itemIds],
	};
}
