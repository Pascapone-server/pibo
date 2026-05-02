import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
	getActivePiboCompactionPromptPath,
	parsePiboCompactionPrompt,
	readPiboCompactionPrompt,
	savePiboCustomCompactionPrompt,
	setPiboCompactionPromptMode,
} from "../dist/core/compaction-prompt.js";

test("compaction prompt switches between library and custom prompt without losing custom content", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pibo-compaction-prompt-"));
	try {
		assert.equal(basename(getActivePiboCompactionPromptPath(cwd)), "pibo-compaction-prompt.md");

		const library = await readPiboCompactionPrompt(cwd);
		const customMarkdown = library.library.markdown.replace("Use this EXACT format:", "Use this EXACT custom format:");
		const saved = await savePiboCustomCompactionPrompt(customMarkdown, cwd);
		assert.equal(saved.mode, "custom");
		assert.equal(saved.effectiveMode, "custom");
		assert.match(saved.custom.markdown, /Use this EXACT custom format:/);
		assert.equal(existsSync(saved.custom.path), true);
		assert.equal(getActivePiboCompactionPromptPath(cwd), saved.custom.path);

		const libraryMode = setPiboCompactionPromptMode("library", cwd);
		assert.equal(libraryMode.effectiveMode, "library");
		assert.match(libraryMode.custom.markdown, /Use this EXACT custom format:/);
		assert.equal(basename(getActivePiboCompactionPromptPath(cwd)), "pibo-compaction-prompt.md");

		const customMode = setPiboCompactionPromptMode("custom", cwd);
		assert.equal(customMode.effectiveMode, "custom");
		assert.match(customMode.custom.markdown, /Use this EXACT custom format:/);
		assert.equal(getActivePiboCompactionPromptPath(cwd), customMode.custom.path);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("compaction prompt parser exposes all prompt sections and rejects broken custom files", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pibo-compaction-prompt-invalid-"));
	try {
		const snapshot = await readPiboCompactionPrompt(cwd);
		const spec = parsePiboCompactionPrompt(snapshot.library.markdown);
		assert.match(spec.systemPrompt, /context summarization assistant/);
		assert.match(spec.summaryPrompt, /## Goal/);
		assert.match(spec.updateSummaryPrompt, /<previous-summary>/);
		assert.match(spec.turnPrefixSummaryPrompt, /## Original Request/);

		await assert.rejects(
			() => savePiboCustomCompactionPrompt("<system-prompt>only one section</system-prompt>", cwd),
			/missing <summary-prompt> section/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
