type RenderMetricsGlobal = typeof globalThis & {
	__piboChatRenderMetrics?: Record<string, number>;
};

export function countRender(name: string): void {
	if (!import.meta.env.DEV) return;
	const target = globalThis as RenderMetricsGlobal;
	target.__piboChatRenderMetrics ??= {};
	target.__piboChatRenderMetrics[name] = (target.__piboChatRenderMetrics[name] ?? 0) + 1;
}
