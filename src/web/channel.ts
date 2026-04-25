import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { PiboAuthService, PiboAuthSession } from "../auth/types.js";
import { PiboAuthError } from "../auth/types.js";
import type { PiboChannel, PiboChannelContext } from "../channels/types.js";
import type { PiboOutputEvent } from "../core/events.js";
import type { PiboSessionBinding } from "../sessions/bindings.js";

export const DEFAULT_WEB_CHANNEL_HOST = "127.0.0.1";
export const DEFAULT_WEB_CHANNEL_PORT = 4788;
export const WEB_CHANNEL_NAME = "web";

export type WebChannelOptions = {
	host?: string;
	port?: number;
	defaultProfile?: string;
	announce?: boolean;
};

export type WebChannel = PiboChannel & {
	getAddress(): { host: string; port: number } | undefined;
};

type SessionContext = {
	authSession: PiboAuthSession;
	binding: PiboSessionBinding;
};

function responseJson(payload: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(payload), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...init.headers,
		},
	});
}

function responseText(text: string, init: ResponseInit = {}): Response {
	return new Response(text, {
		...init,
		headers: {
			"content-type": "text/html; charset=utf-8",
			...init.headers,
		},
	});
}

function unauthorizedResponse(): Response {
	return responseJson({ error: "Unauthenticated" }, { status: 401 });
}

async function nodeRequestToWebRequest(request: IncomingMessage, baseURL: string): Promise<Request> {
	const url = new URL(request.url ?? "/", baseURL);
	const headers = new Headers();
	for (const [key, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) {
			for (const entry of value) headers.append(key, entry);
		} else if (value !== undefined) {
			headers.set(key, value);
		}
	}

	let body: Buffer | undefined;
	if (request.method !== "GET" && request.method !== "HEAD") {
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		body = Buffer.concat(chunks);
	}

	return new Request(url, {
		method: request.method,
		headers,
		body,
	});
}

async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
	const headers: Record<string, string | string[]> = {};
	const setCookie = (webResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
	webResponse.headers.forEach((value, key) => {
		if (key.toLowerCase() !== "set-cookie") {
			headers[key] = value;
		}
	});
	if (setCookie?.length) {
		headers["set-cookie"] = setCookie;
	} else {
		const setCookieHeader = webResponse.headers.get("set-cookie");
		if (setCookieHeader) {
			headers["set-cookie"] = setCookieHeader;
		}
	}

	response.writeHead(webResponse.status, headers);
	if (webResponse.body) {
		const body = Buffer.from(await webResponse.arrayBuffer());
		response.end(body);
	} else {
		response.end();
	}
}

async function readJsonBody<T extends object>(request: Request): Promise<T> {
	try {
		const body = await request.json();
		if (!body || typeof body !== "object") throw new Error("Invalid JSON body");
		return body as T;
	} catch {
		throw new Error("Invalid JSON body");
	}
}

function resolveWebSession(context: PiboChannelContext, authSession: PiboAuthSession, defaultProfile: string): PiboSessionBinding {
	return context.resolveSession({
		channel: WEB_CHANNEL_NAME,
		externalId: authSession.identity.userId,
		defaultProfile,
	});
}

async function requireWebSession(
	context: PiboChannelContext,
	auth: PiboAuthService,
	request: Request,
	defaultProfile: string,
): Promise<SessionContext | undefined> {
	const authSession = await auth.getSession(request.headers);
	if (!authSession) return undefined;
	return {
		authSession,
		binding: resolveWebSession(context, authSession, defaultProfile),
	};
}

function writeSse(response: ServerResponse, event: PiboOutputEvent): void {
	response.write(`event: pibo\n`);
	response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function createWebAppHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Pibo Web</title>
	<style>
		:root {
			color-scheme: light;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			background: #f5f7fb;
			color: #17202c;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			display: grid;
			grid-template-rows: auto 1fr;
		}
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			padding: 14px 20px;
			border-bottom: 1px solid #d9e1ec;
			background: #ffffff;
		}
		main {
			display: grid;
			grid-template-rows: auto 1fr auto;
			min-height: 0;
			max-width: 960px;
			width: 100%;
			margin: 0 auto;
			padding: 20px;
			gap: 14px;
		}
		h1 {
			margin: 0;
			font-size: 18px;
			font-weight: 650;
			letter-spacing: 0;
		}
		button {
			border: 1px solid #bac7d7;
			background: #ffffff;
			color: #17202c;
			border-radius: 6px;
			padding: 8px 12px;
			font: inherit;
			cursor: pointer;
		}
		button.primary {
			background: #1f6feb;
			border-color: #1f6feb;
			color: #ffffff;
		}
		button:disabled {
			cursor: not-allowed;
			opacity: 0.6;
		}
		#user {
			display: flex;
			align-items: center;
			gap: 10px;
			min-width: 0;
			font-size: 14px;
			color: #4d5d70;
		}
		#status {
			padding: 10px 12px;
			border: 1px solid #d9e1ec;
			border-radius: 6px;
			background: #ffffff;
			color: #4d5d70;
			font-size: 14px;
		}
		#messages {
			min-height: 360px;
			overflow: auto;
			padding: 12px;
			border: 1px solid #d9e1ec;
			border-radius: 6px;
			background: #ffffff;
		}
		.message {
			white-space: pre-wrap;
			line-height: 1.45;
			padding: 8px 0;
			border-bottom: 1px solid #eef2f6;
		}
		.message:last-child { border-bottom: 0; }
		.role {
			display: block;
			margin-bottom: 3px;
			font-size: 12px;
			font-weight: 650;
			color: #68798d;
			text-transform: uppercase;
		}
		form {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 10px;
		}
		textarea {
			width: 100%;
			min-height: 48px;
			max-height: 160px;
			resize: vertical;
			border: 1px solid #bac7d7;
			border-radius: 6px;
			padding: 10px 12px;
			font: inherit;
		}
		.hidden { display: none !important; }
		@media (max-width: 640px) {
			header {
				align-items: flex-start;
				flex-direction: column;
			}
			main { padding: 14px; }
			form { grid-template-columns: 1fr; }
		}
	</style>
</head>
<body>
	<header>
		<h1>Pibo Web</h1>
		<div id="user"></div>
	</header>
	<main>
		<div id="status">Checking session...</div>
		<div id="messages" aria-live="polite"></div>
		<form id="composer" class="hidden">
			<textarea id="message" name="message" placeholder="Message pibo" required></textarea>
			<button class="primary" type="submit">Send</button>
		</form>
	</main>
	<script>
		const statusEl = document.querySelector("#status");
		const userEl = document.querySelector("#user");
		const messagesEl = document.querySelector("#messages");
		const composer = document.querySelector("#composer");
		const messageInput = document.querySelector("#message");
		let events;
		let activeAssistant;

		function setStatus(text) {
			statusEl.textContent = text;
		}

		function addMessage(role, text) {
			const item = document.createElement("div");
			item.className = "message";
			const label = document.createElement("span");
			label.className = "role";
			label.textContent = role;
			const body = document.createElement("span");
			body.textContent = text;
			item.append(label, body);
			messagesEl.append(item);
			messagesEl.scrollTop = messagesEl.scrollHeight;
			return body;
		}

		async function signIn() {
			const response = await fetch("/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL: "/", disableRedirect: true }),
			});
			const data = await response.json();
			if (!response.ok || !data.url) {
				setStatus(data.message || data.error || "Could not start Google sign in.");
				return;
			}
			location.href = data.url;
		}

		async function signOut() {
			await fetch("/api/auth/sign-out", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: "{}",
			});
			location.reload();
		}

		function renderSignedOut() {
			userEl.replaceChildren();
			const button = document.createElement("button");
			button.className = "primary";
			button.textContent = "Sign in with Google";
			button.addEventListener("click", signIn);
			userEl.append(button);
			composer.classList.add("hidden");
			setStatus("Sign in to start a pibo session.");
		}

		function renderSignedIn(session) {
			userEl.replaceChildren();
			const label = document.createElement("span");
			label.textContent = session.identity.email || session.identity.name || session.identity.userId;
			const button = document.createElement("button");
			button.textContent = "Sign out";
			button.addEventListener("click", signOut);
			userEl.append(label, button);
			composer.classList.remove("hidden");
			setStatus("Session " + session.binding.sessionKey);
		}

		function connectEvents() {
			if (events) events.close();
			events = new EventSource("/api/pibo/events");
			events.addEventListener("pibo", (event) => {
				const payload = JSON.parse(event.data);
				if (payload.type === "message_started") {
					activeAssistant = addMessage("assistant", "");
					return;
				}
				if (payload.type === "assistant_delta") {
					if (!activeAssistant) activeAssistant = addMessage("assistant", "");
					activeAssistant.textContent += payload.text;
					messagesEl.scrollTop = messagesEl.scrollHeight;
					return;
				}
				if (payload.type === "assistant_message") {
					if (!activeAssistant || !activeAssistant.textContent) {
						activeAssistant = addMessage("assistant", payload.text);
					}
					activeAssistant = undefined;
					return;
				}
				if (payload.type === "session_error") {
					addMessage("error", payload.error);
					activeAssistant = undefined;
				}
			});
			events.onerror = () => setStatus("Event stream disconnected.");
		}

		async function loadSession() {
			const response = await fetch("/api/pibo/session");
			if (response.status === 401) {
				renderSignedOut();
				return;
			}
			const session = await response.json();
			if (!response.ok) {
				setStatus(session.error || "Could not load session.");
				return;
			}
			renderSignedIn(session);
			connectEvents();
		}

		composer.addEventListener("submit", async (event) => {
			event.preventDefault();
			const text = messageInput.value.trim();
			if (!text) return;
			messageInput.value = "";
			addMessage("you", text);
			activeAssistant = undefined;
			const response = await fetch("/api/pibo/message", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text }),
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({ error: "Request failed" }));
				addMessage("error", error.error || "Request failed");
			}
		});

		loadSession();
	</script>
</body>
</html>`;
}

export function createWebChannel(options: WebChannelOptions = {}): WebChannel {
	const host = options.host ?? DEFAULT_WEB_CHANNEL_HOST;
	const port = options.port ?? DEFAULT_WEB_CHANNEL_PORT;
	const defaultProfile = options.defaultProfile ?? "pibo-minimal";
	let server: Server | undefined;
	let context: PiboChannelContext | undefined;

	const requireContext = (): PiboChannelContext => {
		if (!context) throw new Error("Web channel is not started");
		return context;
	};

	const requireAuth = (ctx: PiboChannelContext): PiboAuthService => {
		if (!ctx.auth) throw new Error("Web channel requires an auth service");
		return ctx.auth;
	};

	const handleApiRequest = async (request: Request): Promise<Response> => {
		const ctx = requireContext();
		const auth = requireAuth(ctx);
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/auth/")) {
			if (!auth.handleRequest) {
				return responseJson({ error: "Auth service does not expose HTTP routes" }, { status: 500 });
			}
			return auth.handleRequest(request);
		}

		const session = await requireWebSession(ctx, auth, request, defaultProfile);
		if (!session) return unauthorizedResponse();

		if (url.pathname === "/api/pibo/session" && request.method === "GET") {
			return responseJson({
				identity: session.authSession.identity,
				binding: session.binding,
				capabilities: {
					actions: ctx.getGatewayActions(),
				},
			});
		}

		if (url.pathname === "/api/pibo/message" && request.method === "POST") {
			const body = await readJsonBody<{ text?: unknown }>(request);
			if (typeof body.text !== "string" || body.text.trim().length === 0) {
				return responseJson({ error: "Message text is required" }, { status: 400 });
			}
			const output = await ctx.emit({
				type: "message",
				sessionKey: session.binding.sessionKey,
				id: randomUUID(),
				text: body.text,
				source: "user",
			});
			return responseJson(output);
		}

		if (url.pathname === "/api/pibo/action" && request.method === "POST") {
			const body = await readJsonBody<{ action?: unknown }>(request);
			if (typeof body.action !== "string" || body.action.length === 0) {
				return responseJson({ error: "Action is required" }, { status: 400 });
			}
			const output = await ctx.emit({
				type: "execution",
				sessionKey: session.binding.sessionKey,
				id: randomUUID(),
				action: body.action,
			});
			return responseJson(output);
		}

		return responseJson({ error: "Not found" }, { status: 404 });
	};

	const handleRequest = async (nodeRequest: IncomingMessage, nodeResponse: ServerResponse): Promise<void> => {
		const baseURL = `http://${nodeRequest.headers.host ?? `${host}:${port}`}`;
		const request = await nodeRequestToWebRequest(nodeRequest, baseURL);
		const url = new URL(request.url);

		try {
			if (url.pathname === "/") {
				await sendWebResponse(nodeResponse, responseText(createWebAppHtml()));
				return;
			}

			if (url.pathname === "/api/pibo/events" && request.method === "GET") {
				const ctx = requireContext();
				const auth = requireAuth(ctx);
				const session = await requireWebSession(ctx, auth, request, defaultProfile);
				if (!session) {
					await sendWebResponse(nodeResponse, unauthorizedResponse());
					return;
				}

				nodeResponse.writeHead(200, {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache, no-transform",
					connection: "keep-alive",
				});
				nodeResponse.write(`event: ready\ndata: ${JSON.stringify({ sessionKey: session.binding.sessionKey })}\n\n`);
				const unsubscribe = ctx.subscribe((event) => {
					if (event.sessionKey === session.binding.sessionKey) {
						writeSse(nodeResponse, event);
					}
				});
				nodeRequest.once("close", unsubscribe);
				return;
			}

			if (url.pathname.startsWith("/api/")) {
				await sendWebResponse(nodeResponse, await handleApiRequest(request));
				return;
			}

			await sendWebResponse(nodeResponse, responseJson({ error: "Not found" }, { status: 404 }));
		} catch (error) {
			const status = error instanceof PiboAuthError ? error.statusCode : 500;
			await sendWebResponse(
				nodeResponse,
				responseJson({ error: error instanceof Error ? error.message : String(error) }, { status }),
			);
		}
	};

	return {
		name: WEB_CHANNEL_NAME,
		kind: "web",
		description: "Authenticated local web channel for pibo sessions.",
		auth: { mode: "required" },
		async start(channelContext) {
			if (server) return;
			context = channelContext;
			server = createServer((request, response) => {
				void handleRequest(request, response);
			});
			await new Promise<void>((resolve, reject) => {
				server!.once("error", reject);
				server!.listen(port, host, () => {
					server!.off("error", reject);
					resolve();
				});
			});
			const address = this.getAddress();
			if (address && options.announce !== false) {
				console.error(`pibo web channel listening on http://${address.host}:${address.port}`);
			}
		},
		async stop() {
			context = undefined;
			if (server) {
				await new Promise<void>((resolve, reject) => {
					server!.close((error) => (error ? reject(error) : resolve()));
				});
				server = undefined;
			}
		},
		getAddress() {
			const address = server?.address();
			if (!address || typeof address === "string") return undefined;
			return { host: address.address, port: address.port };
		},
	};
}
