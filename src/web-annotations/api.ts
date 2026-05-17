import { PiboWebHttpError, readJsonBody, responseJson } from "../web/http.js";
import type { PiboWebApp, PiboWebAppContext, PiboWebSession } from "../web/types.js";
import { createWebAnnotationCdpService, type WebAnnotationCdpService, type WebAnnotationBindingContext } from "./cdp.js";
import { createDefaultWebAnnotationStore, type WebAnnotationStore } from "./store.js";

export const WEB_ANNOTATIONS_API_PREFIX = "/api/web-annotations";
export const WEB_ANNOTATIONS_APP_MOUNT = "/apps/web-annotations";

export type WebAnnotationsWebAppOptions = {
	store?: WebAnnotationStore;
	cdpService?: WebAnnotationCdpService;
};

type BindingBody = {
	piboSessionId?: string;
	piboRoomId?: string;
	url?: string;
	targetId?: string;
	cdpUrl?: string;
};

type InjectBody = {
	piboSessionId?: string;
	piboRoomId?: string;
	cdpUrl?: string;
};

let defaultStore: WebAnnotationStore | undefined;

function getDefaultStore(): WebAnnotationStore {
	defaultStore ??= createDefaultWebAnnotationStore();
	return defaultStore;
}

export function createWebAnnotationsWebApp(options: WebAnnotationsWebAppOptions = {}): PiboWebApp {
	const store = options.store ?? getDefaultStore();
	const baseService = options.cdpService ?? createWebAnnotationCdpService({ store });

	return {
		name: "web-annotations",
		mountPath: WEB_ANNOTATIONS_APP_MOUNT,
		apiPrefix: WEB_ANNOTATIONS_API_PREFIX,
		async handleRequest(request, context) {
			const url = new URL(request.url);
			if (url.pathname === WEB_ANNOTATIONS_APP_MOUNT && request.method === "GET") {
				return responseJson({ ok: true, apiPrefix: WEB_ANNOTATIONS_API_PREFIX });
			}
			if (!url.pathname.startsWith(WEB_ANNOTATIONS_API_PREFIX)) return undefined;

			try {
				const webSession = await context.requireSession({ request });

				if (url.pathname === `${WEB_ANNOTATIONS_API_PREFIX}/targets` && request.method === "GET") {
					const service = serviceForRequest(baseService, url.searchParams.get("cdpUrl") ?? undefined, store, options);
					const targets = await service.listTargets();
					return responseJson({ ok: true, targets });
				}

				if (url.pathname === `${WEB_ANNOTATIONS_API_PREFIX}/bindings` && request.method === "GET") {
					const piboSessionId = requireQueryParam(url, "piboSessionId");
					const bindingContext = resolveBindingContext(context, webSession, { piboSessionId });
					const bindings = baseService.listBindings(bindingContext, parseLimit(url.searchParams.get("limit")));
					return responseJson({ ok: true, bindings });
				}

				if (url.pathname === `${WEB_ANNOTATIONS_API_PREFIX}/bindings` && request.method === "POST") {
					requireSameOriginJsonRequest(request);
					const body = await readJsonBody<BindingBody>(request);
					const bindingContext = resolveBindingContext(context, webSession, body);
					const service = serviceForRequest(baseService, body.cdpUrl, store, options);
					if (body.url) {
						const result = await service.createUrlBinding({ ...bindingContext, url: body.url });
						return responseJson({ ok: true, ...result }, { status: 201 });
					}
					if (body.targetId) {
						const result = await service.createTargetBinding({ ...bindingContext, targetId: body.targetId });
						return responseJson({ ok: true, ...result }, { status: 201 });
					}
					throw new PiboWebHttpError("url or targetId is required", 400);
				}

				const bindingResource = matchBindingResource(url.pathname);
				if (bindingResource) {
					if (request.method === "POST" && (bindingResource.action === "inject" || bindingResource.action === "reinject")) {
						requireSameOriginJsonRequest(request);
						const body = await readJsonBody<InjectBody>(request);
						const bindingContext = resolveBindingContext(context, webSession, body);
						const service = serviceForRequest(baseService, body.cdpUrl, store, options);
						const result = await service.injectBinding(bindingContext, bindingResource.id);
						return responseJson({ ok: true, ...result });
					}
					if (request.method === "POST" && bindingResource.action === "stop") {
						requireSameOriginJsonRequest(request);
						const body = await readJsonBody<InjectBody>(request);
						const bindingContext = resolveBindingContext(context, webSession, body);
						const service = serviceForRequest(baseService, body.cdpUrl, store, options);
						const result = await service.stopBinding(bindingContext, bindingResource.id);
						return responseJson({ ok: true, ...result });
					}
					if (request.method === "DELETE" && !bindingResource.action) {
						requireSameOriginRequest(request);
						const piboSessionId = requireQueryParam(url, "piboSessionId");
						const bindingContext = resolveBindingContext(context, webSession, { piboSessionId });
						return responseJson({ ok: true, removed: baseService.removeBinding(bindingContext, bindingResource.id) });
					}
				}

				return undefined;
			} catch (error) {
				if (error instanceof PiboWebHttpError) throw error;
				throw new PiboWebHttpError(error instanceof Error ? error.message : String(error), 400);
			}
		},
	};
}

function requireSameOriginJsonRequest(request: Request): void {
	const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
	if (contentType !== "application/json") throw new PiboWebHttpError("Content-Type must be application/json", 415);
	requireSameOriginRequest(request);
}

function requireSameOriginRequest(request: Request): void {
	const origin = request.headers.get("origin");
	if (!origin) throw new PiboWebHttpError("Origin header is required", 403);
	if (origin !== new URL(request.url).origin) throw new PiboWebHttpError("Origin is not allowed", 403);
}

function serviceForRequest(baseService: WebAnnotationCdpService, cdpUrl: string | undefined, store: WebAnnotationStore, options: WebAnnotationsWebAppOptions): WebAnnotationCdpService {
	if (!cdpUrl || options.cdpService) return baseService;
	return createWebAnnotationCdpService({ store, cdpUrl });
}

function resolveBindingContext(context: PiboWebAppContext, webSession: PiboWebSession, input: { piboSessionId?: string; piboRoomId?: string }): WebAnnotationBindingContext {
	const piboSessionId = input.piboSessionId?.trim();
	if (!piboSessionId) throw new PiboWebHttpError("piboSessionId is required", 400);
	const session = context.channelContext.getSession(piboSessionId);
	if (!session) throw new PiboWebHttpError("Pibo session not found", 404);
	if (session.ownerScope && session.ownerScope !== webSession.ownerScope) throw new PiboWebHttpError("Pibo session is not authorized for this user", 403);
	return {
		ownerScope: webSession.ownerScope,
		piboSessionId,
		piboRoomId: input.piboRoomId?.trim() || undefined,
	};
}

function requireQueryParam(url: URL, name: string): string {
	const value = url.searchParams.get(name)?.trim();
	if (!value) throw new PiboWebHttpError(`${name} is required`, 400);
	return value;
}

function parseLimit(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function matchBindingResource(pathname: string): { id: string; action?: string } | undefined {
	const prefix = `${WEB_ANNOTATIONS_API_PREFIX}/bindings/`;
	if (!pathname.startsWith(prefix)) return undefined;
	const parts = pathname.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
	if (parts.length === 0 || parts.length > 2) return undefined;
	return { id: parts[0], action: parts[1] };
}
