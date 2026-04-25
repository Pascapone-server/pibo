import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_WEB_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

export class PiboWebHttpError extends Error {
	constructor(
		message: string,
		readonly statusCode: number,
	) {
		super(message);
		this.name = "PiboWebHttpError";
	}
}

export function responseJson(payload: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(payload), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...init.headers,
		},
	});
}

export function responseHtml(html: string, init: ResponseInit = {}): Response {
	return new Response(html, {
		...init,
		headers: {
			"content-type": "text/html; charset=utf-8",
			...init.headers,
		},
	});
}

export async function readJsonBody<T extends object>(request: Request): Promise<T> {
	try {
		const body = await request.json();
		if (!body || typeof body !== "object") throw new PiboWebHttpError("Invalid JSON body", 400);
		return body as T;
	} catch {
		throw new PiboWebHttpError("Invalid JSON body", 400);
	}
}

export async function nodeRequestToWebRequest(request: IncomingMessage, baseURL: string): Promise<Request> {
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
		let receivedBytes = 0;
		for await (const chunk of request) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			receivedBytes += buffer.length;
			if (receivedBytes > MAX_WEB_REQUEST_BODY_BYTES) {
				throw new PiboWebHttpError("Request body too large", 413);
			}
			chunks.push(buffer);
		}
		body = Buffer.concat(chunks);
	}

	return new Request(url, {
		method: request.method,
		headers,
		body,
	});
}

export async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
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
	if (!webResponse.body) {
		response.end();
		return;
	}

	const reader = webResponse.body.getReader();
	const cancel = () => {
		void reader.cancel();
	};
	response.once("close", cancel);
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			response.write(Buffer.from(value));
		}
		response.end();
	} finally {
		response.off("close", cancel);
	}
}
