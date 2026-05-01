import "./prism-client";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import {
	BlockTypeSelect,
	BoldItalicUnderlineToggles,
	CodeMirrorEditor,
	CodeToggle,
	CreateLink,
	InsertCodeBlock,
	InsertTable,
	InsertThematicBreak,
	ListsToggle,
	MDXEditor,
	UndoRedo,
	codeBlockPlugin,
	codeMirrorPlugin,
	headingsPlugin,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	markdownShortcutPlugin,
	quotePlugin,
	tablePlugin,
	thematicBreakPlugin,
	toolbarPlugin,
} from "@mdxeditor/editor";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { SaveState } from "../api";
import "@mdxeditor/editor/style.css";

type MarkdownEditorProps = {
	documentKey: string;
	initialMarkdown: string;
	onPersist(markdown: string): Promise<void>;
	onSaveStateChange(state: SaveState): void;
	readOnly?: boolean;
};

export type MarkdownEditorHandle = {
	flushSave(): Promise<void>;
	getMarkdown(): string;
};

const AUTOSAVE_DELAY_MS = 900;

const CODE_BLOCK_LANGUAGES = {
	txt: "Text",
	text: "Text",
	plaintext: "Plain Text",
	md: "Markdown",
	ts: "TypeScript",
	tsx: "TSX",
	js: "JavaScript",
	json: "JSON",
	css: "CSS",
	bash: "Bash",
	sh: "Shell",
	shell: "Shell",
	yaml: "YAML",
	yml: "YAML",
	toml: "TOML",
	cron: "Cron",
} as const;

export const MarkdownEditor = memo(
	forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditorImpl(
		{ documentKey, initialMarkdown, onPersist, onSaveStateChange, readOnly = false },
		ref,
	) {
		const editorRef = useRef<MDXEditorMethods>(null);
		const previousDocumentKeyRef = useRef(documentKey);
		const currentMarkdownRef = useRef(initialMarkdown);
		const savedMarkdownRef = useRef(initialMarkdown);
		const savePromiseRef = useRef<Promise<void> | null>(null);
		const timeoutRef = useRef<number | null>(null);
		const ignoreNextChangeRef = useRef(true);
		const [editorMode, setEditorMode] = useState<"rich" | "plain">("rich");
		const [plainMarkdown, setPlainMarkdown] = useState(initialMarkdown);

		const clearAutosaveTimer = useCallback(() => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		}, []);

		const persistIfNeeded = useCallback(async () => {
			if (readOnly) {
				onSaveStateChange("saved");
				return;
			}
			if (savePromiseRef.current) await savePromiseRef.current;
			const nextMarkdown = currentMarkdownRef.current;
			if (nextMarkdown === savedMarkdownRef.current) {
				onSaveStateChange("saved");
				return;
			}

			onSaveStateChange("saving");
			const savePromise = (async () => {
				await onPersist(nextMarkdown);
				savedMarkdownRef.current = nextMarkdown;
			})();
			savePromiseRef.current = savePromise;

			try {
				await savePromise;
				if (currentMarkdownRef.current === savedMarkdownRef.current) {
					onSaveStateChange("saved");
					return;
				}
				await persistIfNeeded();
			} catch {
				onSaveStateChange("error");
				throw new Error("Autosave failed");
			} finally {
				if (savePromiseRef.current === savePromise) savePromiseRef.current = null;
			}
		}, [onPersist, onSaveStateChange, readOnly]);

		const scheduleAutosave = useCallback(() => {
			if (readOnly) return;
			clearAutosaveTimer();
			timeoutRef.current = window.setTimeout(() => {
				timeoutRef.current = null;
				void persistIfNeeded();
			}, AUTOSAVE_DELAY_MS);
		}, [clearAutosaveTimer, persistIfNeeded, readOnly]);

		const handleEditorChange = useCallback(
			(markdown: string) => {
				if (ignoreNextChangeRef.current) {
					ignoreNextChangeRef.current = false;
					currentMarkdownRef.current = markdown;
					savedMarkdownRef.current = markdown;
					setPlainMarkdown(markdown);
					onSaveStateChange("saved");
					return;
				}
				currentMarkdownRef.current = markdown;
				if (readOnly) {
					onSaveStateChange("saved");
					return;
				}
				onSaveStateChange("idle");
				scheduleAutosave();
			},
			[onSaveStateChange, readOnly, scheduleAutosave],
		);

		const plugins = useMemo(
			() => [
				headingsPlugin(),
				listsPlugin(),
				quotePlugin(),
				thematicBreakPlugin(),
				linkPlugin(),
				linkDialogPlugin(),
				tablePlugin(),
				codeBlockPlugin({
					defaultCodeBlockLanguage: "txt",
					codeBlockEditorDescriptors: [{ priority: -10, match: () => true, Editor: CodeMirrorEditor }],
				}),
				codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
				markdownShortcutPlugin(),
				toolbarPlugin({
					toolbarContents: () => (
						<>
							<UndoRedo />
							<BoldItalicUnderlineToggles />
							<CodeToggle />
							<BlockTypeSelect />
							<ListsToggle />
							<CreateLink />
							<InsertTable />
							<InsertThematicBreak />
							<InsertCodeBlock />
						</>
					),
				}),
			],
			[],
		);

		useImperativeHandle(ref, () => ({
			flushSave: async () => {
				clearAutosaveTimer();
				await persistIfNeeded();
			},
			getMarkdown: () => currentMarkdownRef.current,
		}));

		useEffect(() => () => clearAutosaveTimer(), [clearAutosaveTimer]);

		useEffect(() => {
			const documentChanged = previousDocumentKeyRef.current !== documentKey;
			const contentChangedExternally = initialMarkdown !== savedMarkdownRef.current;
			if (!documentChanged && !contentChangedExternally) return;

			previousDocumentKeyRef.current = documentKey;
			clearAutosaveTimer();
			savePromiseRef.current = null;
			currentMarkdownRef.current = initialMarkdown;
			savedMarkdownRef.current = initialMarkdown;
			ignoreNextChangeRef.current = true;
			setPlainMarkdown(initialMarkdown);
			setEditorMode("rich");
			onSaveStateChange("saved");
		}, [documentKey, initialMarkdown, onSaveStateChange, clearAutosaveTimer]);

		if (editorMode === "plain" || readOnly) {
			return (
				<div className="context-files-plain-fallback">
					<p className="context-files-plain-fallback__notice">
						{readOnly
							? "This document is read-only. Create a managed copy to edit it."
							: "The rich editor could not safely load this document. You are editing raw markdown."}
					</p>
					<textarea
						className="context-files-plain-fallback__textarea"
						value={readOnly ? initialMarkdown : plainMarkdown}
						readOnly={readOnly}
						onChange={(event) => {
							if (readOnly) return;
							const markdown = event.currentTarget.value;
							setPlainMarkdown(markdown);
							currentMarkdownRef.current = markdown;
							onSaveStateChange("idle");
							scheduleAutosave();
						}}
						spellCheck={false}
					/>
				</div>
			);
		}

		return (
			<MDXEditor
				key={documentKey}
				ref={editorRef}
				markdown={initialMarkdown}
				onChange={handleEditorChange}
				onError={(payload) => {
					console.error("MDXEditor error", payload);
					setPlainMarkdown(currentMarkdownRef.current);
					setEditorMode("plain");
				}}
				contentEditableClassName="context-files-mdx-content"
				readOnly={readOnly}
				plugins={plugins}
			/>
		);
	}),
);
