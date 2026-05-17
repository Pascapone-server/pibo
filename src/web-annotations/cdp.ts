import type { PiboJsonObject } from "../core/events.js";
import {
	DEFAULT_CDP_TIMEOUT_MS,
	connectCdpTarget,
	findCdpTarget,
	listCdpTargets,
	openCdpTarget,
	type CdpTarget,
} from "../tools/cdp-client.js";
import type { WebAnnotationBinding } from "./types.js";
import { createDefaultWebAnnotationStore, type WebAnnotationStore } from "./store.js";

export type WebAnnotationCdpServiceOptions = {
	store?: WebAnnotationStore;
	cdpUrl?: string;
	timeoutMs?: number;
};

export type WebAnnotationBindingContext = {
	ownerScope: string;
	piboSessionId: string;
	piboRoomId?: string;
};

export type WebAnnotationTargetSummary = {
	id: string;
	type: string;
	title: string;
	url: string;
	attachable: boolean;
};

export type CreateUrlBindingInput = WebAnnotationBindingContext & {
	url: string;
};

export type CreateTargetBindingInput = WebAnnotationBindingContext & {
	targetId: string;
};

export type BindingOperationResult = {
	binding: WebAnnotationBinding;
	target?: WebAnnotationTargetSummary;
	injected?: boolean;
	stopped?: boolean;
};

const MAX_TITLE_LENGTH = 200;
const MAX_URL_LENGTH = 2_000;

let defaultStore: WebAnnotationStore | undefined;

function getDefaultStore(): WebAnnotationStore {
	defaultStore ??= createDefaultWebAnnotationStore();
	return defaultStore;
}

export class WebAnnotationCdpService {
	private readonly store: WebAnnotationStore;
	private readonly cdpUrl?: string;
	private readonly timeoutMs: number;

	constructor(options: WebAnnotationCdpServiceOptions = {}) {
		this.store = options.store ?? getDefaultStore();
		this.cdpUrl = options.cdpUrl;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS;
	}

	async listTargets(): Promise<WebAnnotationTargetSummary[]> {
		const targets = await listCdpTargets({ cdpUrl: this.cdpUrl, timeoutMs: this.timeoutMs });
		return targets.map(targetSummary);
	}

	listBindings(context: WebAnnotationBindingContext, limit?: number): WebAnnotationBinding[] {
		return this.store.listBindings({ ownerScope: context.ownerScope, piboSessionId: context.piboSessionId, limit });
	}

	async createUrlBinding(input: CreateUrlBindingInput): Promise<BindingOperationResult> {
		const url = normalizeUserUrl(input.url);
		const target = await openCdpTarget(url, { cdpUrl: this.cdpUrl, timeoutMs: this.timeoutMs });
		const binding = this.store.createBinding({
			ownerScope: input.ownerScope,
			piboSessionId: input.piboSessionId,
			piboRoomId: input.piboRoomId,
			url: target.url || url,
			title: trim(target.title, MAX_TITLE_LENGTH),
			targetId: target.id,
			state: "active",
			metadata: bindingMetadata(target, { source: "url" }),
		});
		return { binding, target: targetSummary(target) };
	}

	async createTargetBinding(input: CreateTargetBindingInput): Promise<BindingOperationResult> {
		const selectedTargetId = requireNonEmpty(input.targetId, "targetId");
		const targets = await listCdpTargets({ cdpUrl: this.cdpUrl, timeoutMs: this.timeoutMs });
		const target = findCdpTarget(targets, selectedTargetId);
		if (!target) throw new Error("Selected CDP target was not found");
		if (!target.webSocketDebuggerUrl) throw new Error("Selected CDP target is not attachable");
		const binding = this.store.createBinding({
			ownerScope: input.ownerScope,
			piboSessionId: input.piboSessionId,
			piboRoomId: input.piboRoomId,
			url: target.url,
			title: trim(target.title, MAX_TITLE_LENGTH),
			targetId: target.id,
			state: "active",
			metadata: bindingMetadata(target, { source: "target" }),
		});
		return { binding, target: targetSummary(target) };
	}

	async injectBinding(context: WebAnnotationBindingContext, bindingId: string): Promise<BindingOperationResult> {
		const binding = this.requireBinding(context, bindingId);
		const target = await this.resolveBindingTarget(binding);
		const client = await connectCdpTarget(target, this.timeoutMs);
		try {
			const result = await client.evaluate<{ ok?: boolean; url?: string; title?: string }>(buildInjectExpression({
				bindingId: binding.id,
				apiBasePath: "/api/web-annotations",
			}), this.timeoutMs);
			if (!result?.ok) throw new Error("Overlay injection did not report success");
			const updated = this.store.patchBinding(context.ownerScope, context.piboSessionId, binding.id, {
				state: "injected",
				title: trim(result.title, MAX_TITLE_LENGTH) ?? binding.title,
				targetId: target.id,
				lastInjectedAt: new Date().toISOString(),
				closedAt: null,
				error: null,
				metadata: mergeMetadata(binding.metadata, bindingMetadata(target, { overlay: "injected" })),
			});
			return { binding: updated ?? binding, target: targetSummary(target), injected: true };
		} catch (error) {
			this.store.patchBinding(context.ownerScope, context.piboSessionId, binding.id, {
				state: "error",
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			client.close();
		}
	}

	async stopBinding(context: WebAnnotationBindingContext, bindingId: string): Promise<BindingOperationResult> {
		const binding = this.requireBinding(context, bindingId);
		const target = await this.resolveBindingTarget(binding);
		const client = await connectCdpTarget(target, this.timeoutMs);
		try {
			await client.evaluate<{ ok?: boolean }>(buildStopExpression(), this.timeoutMs);
			const updated = this.store.patchBinding(context.ownerScope, context.piboSessionId, binding.id, {
				state: "active",
				targetId: target.id,
				error: null,
				metadata: mergeMetadata(binding.metadata, bindingMetadata(target, { overlay: "stopped" })),
			});
			return { binding: updated ?? binding, target: targetSummary(target), stopped: true };
		} finally {
			client.close();
		}
	}

	removeBinding(context: WebAnnotationBindingContext, bindingId: string): boolean {
		return this.store.removeBinding(context.ownerScope, context.piboSessionId, bindingId);
	}

	private requireBinding(context: WebAnnotationBindingContext, bindingId: string): WebAnnotationBinding {
		const id = requireNonEmpty(bindingId, "bindingId");
		const binding = this.store.getBinding(context.ownerScope, context.piboSessionId, id);
		if (!binding || binding.state === "removed") throw new Error("Web Annotation binding was not found for this owner/session");
		return binding;
	}

	private async resolveBindingTarget(binding: WebAnnotationBinding): Promise<CdpTarget> {
		if (!binding.targetId) throw new Error("Web Annotation binding has no CDP target id");
		const targets = await listCdpTargets({ cdpUrl: this.cdpUrl, timeoutMs: this.timeoutMs });
		const target = findCdpTarget(targets, binding.targetId);
		if (target?.webSocketDebuggerUrl) return target;
		this.store.patchBinding(binding.ownerScope, binding.piboSessionId, binding.id, {
			state: "closed",
			closedAt: new Date().toISOString(),
			error: "Bound CDP target is no longer reachable",
		});
		throw new Error("Bound CDP target is no longer reachable");
	}
}

export function createWebAnnotationCdpService(options: WebAnnotationCdpServiceOptions = {}): WebAnnotationCdpService {
	return new WebAnnotationCdpService(options);
}

function normalizeUserUrl(value: string): string {
	const raw = requireNonEmpty(value, "url");
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error("Invalid URL");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Invalid URL protocol; expected http or https");
	return parsed.toString();
}

function requireNonEmpty(value: string | undefined, field: string): string {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) throw new Error(`${field} is required`);
	return trimmed;
}

function trim(value: string | undefined, max: number): string | undefined {
	if (value === undefined) return undefined;
	return value.length > max ? value.slice(0, max) : value;
}

function targetSummary(target: CdpTarget): WebAnnotationTargetSummary {
	return {
		id: target.id,
		type: target.type,
		title: trim(target.title, MAX_TITLE_LENGTH) ?? "",
		url: trim(target.url, MAX_URL_LENGTH) ?? "",
		attachable: Boolean(target.webSocketDebuggerUrl),
	};
}

function bindingMetadata(target: CdpTarget, extra: Record<string, string>): PiboJsonObject {
	return {
		...extra,
		cdpTarget: targetSummary(target),
	};
}

function mergeMetadata(existing: PiboJsonObject | undefined, next: PiboJsonObject): PiboJsonObject {
	return { ...(existing ?? {}), ...next };
}

function buildInjectExpression(config: { bindingId: string; apiBasePath: string }): string {
	return `(() => {
  const config = ${JSON.stringify(config)};
  const rootId = "pibo-web-annotation-overlay";
  const previous = window.__piboWebAnnotations;
  if (previous && typeof previous.remove === "function") previous.remove();
  const root = document.createElement("div");
  root.id = rootId;
  root.setAttribute("data-pibo-web-annotation-binding", config.bindingId);
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#111827;color:white;border:1px solid #374151;border-radius:10px;padding:10px 12px;font:13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto";
  root.textContent = "Pibo annotations active";
  document.documentElement.appendChild(root);
  window.__piboWebAnnotations = {
    bindingId: config.bindingId,
    apiBasePath: config.apiBasePath,
    injectedAt: new Date().toISOString(),
    remove() {
      const current = document.getElementById(rootId);
      if (current) current.remove();
      if (window.__piboWebAnnotations && window.__piboWebAnnotations.bindingId === config.bindingId) delete window.__piboWebAnnotations;
    },
  };
  return { ok: true, url: location.href, title: document.title || "" };
})()`;
}

function buildStopExpression(): string {
	return `(() => {
  const previous = window.__piboWebAnnotations;
  if (previous && typeof previous.remove === "function") previous.remove();
  const root = document.getElementById("pibo-web-annotation-overlay");
  if (root) root.remove();
  return { ok: true };
})()`;
}
