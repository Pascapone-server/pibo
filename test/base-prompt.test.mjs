import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
	getActivePiboBasePromptPath,
	readPiboBasePrompt,
	savePiboCustomBasePrompt,
	setPiboBasePromptMode,
} from "../dist/core/base-prompt.js";

test("base prompt switches between library and custom prompt without losing custom content", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pibo-base-prompt-"));
	try {
		assert.equal(basename(getActivePiboBasePromptPath(cwd)), "pibo-system-prompt.md");

		const saved = await savePiboCustomBasePrompt("custom base prompt", cwd);
		assert.equal(saved.mode, "custom");
		assert.equal(saved.effectiveMode, "custom");
		assert.equal(saved.custom.markdown, "custom base prompt");
		assert.equal(existsSync(saved.custom.path), true);
		assert.equal(getActivePiboBasePromptPath(cwd), saved.custom.path);

		const library = setPiboBasePromptMode("library", cwd);
		assert.equal(library.effectiveMode, "library");
		assert.equal(library.custom.markdown, "custom base prompt");
		assert.equal(basename(getActivePiboBasePromptPath(cwd)), "pibo-system-prompt.md");

		const custom = setPiboBasePromptMode("custom", cwd);
		assert.equal(custom.effectiveMode, "custom");
		assert.equal(custom.custom.markdown, "custom base prompt");
		assert.equal(getActivePiboBasePromptPath(cwd), custom.custom.path);

		const snapshot = await readPiboBasePrompt(cwd);
		assert.equal(snapshot.custom.markdown, "custom base prompt");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
