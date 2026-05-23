import { memo, type ReactElement } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import prism from "../context/prism-client";
import { isStreamingDebugEnabled, recordStreamingDebugMarkdownRender } from "../streamingDebug";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-yaml";

type MarkdownRendererProps = {
	children: string;
};

const allowedElements = [
	"p",
	"br",
	"strong",
	"em",
	"a",
	"ul",
	"ol",
	"li",
	"blockquote",
	"code",
	"pre",
	"h1",
	"h2",
	"h3",
	"h4",
	"hr",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"input",
	"del",
];

const gfmRemarkPlugins = [remarkGfm];
const commonMarkRemarkPlugins: typeof gfmRemarkPlugins = [];

const markdownStructuralPattern = /[\n\r\\`*_\[\]<>]|~~/;
const markdownLinePrefixPattern = /^\s*(?:#{1,6}\s|[-+>]|(?:\d+[.)]))\s/;
const markdownThematicBreakPattern = /^\s*-{3,}\s*$/;
const markdownAutolinkPattern = /\b(?:https?:\/\/|www\.)|\S+@\S+\.\S+/i;
const markdownTaskListPattern = /^\s*[-+*]\s+\[[ xX]\]\s/m;
const markdownTablePattern = /(^|\n)\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*(?:\n|$)/;

export function isPlainMarkdownText(markdown: string): boolean {
	return markdown.length > 0
		&& !markdownStructuralPattern.test(markdown)
		&& !markdownLinePrefixPattern.test(markdown)
		&& !markdownThematicBreakPattern.test(markdown)
		&& !markdownAutolinkPattern.test(markdown);
}

export function requiresGfmMarkdown(markdown: string): boolean {
	return markdown.includes("~~")
		|| markdownTaskListPattern.test(markdown)
		|| markdownTablePattern.test(markdown)
		|| markdownAutolinkPattern.test(markdown);
}

const simpleGfmStrikethroughForbiddenPattern = /[\n\r\\`*_\[\]<>]/;

function renderSimpleGfmStrikethrough(markdown: string): ReactElement | undefined {
	if (!markdown.includes("~~")) return undefined;
	if (simpleGfmStrikethroughForbiddenPattern.test(markdown)) return undefined;
	if (markdownLinePrefixPattern.test(markdown) || markdownThematicBreakPattern.test(markdown) || markdownAutolinkPattern.test(markdown) || markdownTaskListPattern.test(markdown) || markdownTablePattern.test(markdown)) return undefined;

	const parts: Array<string | ReactElement> = [];
	let cursor = 0;
	let delCount = 0;
	while (cursor < markdown.length) {
		const start = markdown.indexOf("~~", cursor);
		if (start === -1) {
			parts.push(markdown.slice(cursor));
			break;
		}
		const end = markdown.indexOf("~~", start + 2);
		if (end === -1 || end === start + 2) return undefined;
		const plainPrefix = markdown.slice(cursor, start);
		if (plainPrefix) parts.push(plainPrefix);
		const deletedText = markdown.slice(start + 2, end);
		if (deletedText.includes("~")) return undefined;
		parts.push(<del key={`del-${delCount}`} data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="del">{deletedText}</del>);
		delCount += 1;
		cursor = end + 2;
	}
	return delCount > 0 ? <p data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="p">{parts}</p> : undefined;
}

const components: Components = {
	p({ children, node: _node, ...props }) {
		return <p data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="p" {...props}>{children}</p>;
	},
	ul({ children, node: _node, ...props }) {
		return <ul data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="ul" {...props}>{children}</ul>;
	},
	ol({ children, node: _node, ...props }) {
		return <ol data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="ol" {...props}>{children}</ol>;
	},
	li({ children, node: _node, ...props }) {
		return <li data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="li" {...props}>{children}</li>;
	},
	blockquote({ children, node: _node, ...props }) {
		return <blockquote data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="blockquote" {...props}>{children}</blockquote>;
	},
	pre({ children, node: _node, ...props }) {
		return <pre data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="pre" {...props}>{children}</pre>;
	},
	a({ href, children }) {
		return (
			<a href={href} target="_blank" rel="noreferrer" data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="a">
				{children}
			</a>
		);
	},
	code({ className, children, node: _node, ...props }) {
		const language = languageFromClassName(className);
		const code = String(children).replace(/\n$/, "");
		if (!language) {
			return (
				<code className={className} data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="code" {...props}>
					{children}
				</code>
			);
		}
		const grammar = prism.languages[language];
		if (!grammar) {
			return (
				<code className={className} data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="code" {...props}>
					{children}
				</code>
			);
		}
		return (
			<code
				className={`language-${language}`}
				data-pibo-component="MarkdownRenderer"
				data-pibo-markdown-node="code"
				dangerouslySetInnerHTML={{ __html: prism.highlight(code, grammar, language) }}
				{...props}
			/>
		);
	},
	th({ children, node: _node, ...props }) {
		return <th data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="th" {...props}>{children}</th>;
	},
	td({ children, node: _node, ...props }) {
		return <td data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="td" {...props}>{children}</td>;
	},
	input({ checked, node: _node, ...props }) {
		return <input type="checkbox" checked={Boolean(checked)} readOnly disabled data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="input" {...props} />;
	},
};

function languageFromClassName(className?: string): string | undefined {
	const match = /language-(\S+)/.exec(className ?? "");
	if (!match) return undefined;
	const language = match[1].toLowerCase();
	if (language === "sh" || language === "shell") return "bash";
	if (language === "js") return "javascript";
	if (language === "ts") return "typescript";
	if (language === "md") return "markdown";
	if (language === "yml") return "yaml";
	return language;
}

function recordMarkdownRenderIfEnabled(mode: "plain" | "commonmark" | "gfm", startedAt: number | undefined): void {
	if (startedAt === undefined) return;
	const endedAt = typeof performance === "undefined" ? Date.now() : performance.now();
	recordStreamingDebugMarkdownRender(mode, endedAt - startedAt);
}

const safeUrlTransform: UrlTransform = (url, key, node) => {
	if (node.tagName !== "a" || key !== "href") return "";
	const transformed = defaultUrlTransform(url);
	if (!transformed) return "";
	if (transformed.startsWith("/") || transformed.startsWith("#")) return transformed;
	try {
		const parsed = new URL(transformed);
		return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" ? transformed : "";
	} catch {
		return "";
	}
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ children }: MarkdownRendererProps) {
	const startedAt = isStreamingDebugEnabled()
		? (typeof performance === "undefined" ? Date.now() : performance.now())
		: undefined;
	let mode: "plain" | "commonmark" | "gfm" = "commonmark";
	let element: ReactElement;
	if (isPlainMarkdownText(children)) {
		mode = "plain";
		element = <p data-pibo-component="MarkdownRenderer" data-pibo-markdown-node="p">{children}</p>;
	} else {
		const useGfm = requiresGfmMarkdown(children);
		mode = useGfm ? "gfm" : "commonmark";
		const simpleGfmElement = useGfm ? renderSimpleGfmStrikethrough(children) : undefined;
		if (simpleGfmElement) {
			element = simpleGfmElement;
		} else {
			// ReactMarkdown is a synchronous parser/render function; call it directly so debug timings include its parse/tree-build work.
			element = ReactMarkdown({
				allowedElements,
				children,
				components,
				remarkPlugins: useGfm ? gfmRemarkPlugins : commonMarkRemarkPlugins,
				skipHtml: true,
				urlTransform: safeUrlTransform,
			});
		}
	}
	recordMarkdownRenderIfEnabled(mode, startedAt);
	return element;
});
