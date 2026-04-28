import type { Span } from "../types";

const shouldDisplaySpan = (span: Span): boolean => {
	if (span.spanType === "model.request") return false;
	if (span.spanType === "model.response") return true;
	return true;
};

export function processSpanTree(spans: Span[]): Span[] {
	const processed: Span[] = [];

	for (const span of spans) {
		const children = span.children ? processSpanTree(span.children) : [];
		const spanWithChildren = { ...span, children };
		if (shouldDisplaySpan(span)) {
			processed.push(spanWithChildren);
		} else {
			processed.push(...children);
		}
	}

	return processed.sort((left, right) => left.startTime - right.startTime);
}
