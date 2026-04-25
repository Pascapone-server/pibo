import assert from "node:assert/strict";
import test from "node:test";
import { PiboAuthError } from "../dist/auth/types.js";
import { createWebChannel } from "../dist/web/channel.js";

class MemoryBindingStore {
	bindings = new Map();

	resolve(input) {
		for (const binding of this.bindings.values()) {
			if (binding.channel === input.channel && binding.externalId === input.externalId) {
				return binding;
			}
		}

		const now = new Date().toISOString();
		const binding = {
			sessionKey: input.sessionKey ?? `${input.channel}:${input.externalId}`,
			channel: input.channel,
			externalId: input.externalId,
			originalProfile: input.defaultProfile,
			createdAt: now,
			updatedAt: now,
		};
		this.bindings.set(binding.sessionKey, binding);
		return binding;
	}
}

function createFakeAuthService() {
	return {
		name: "fake-auth",
		async getSession(headers) {
			const userId = headers.get("x-test-user");
			if (!userId) return undefined;
			return {
				identity: {
					userId,
					email: `${userId}@example.test`,
					provider: "test",
				},
			};
		},
		async requireSession(headers) {
			const session = await this.getSession(headers);
			if (!session) throw new Error("Unauthenticated");
			return session;
		},
	};
}

test("web channel requires auth and maps authenticated users to web bindings", async () => {
	const emitted = [];
	const bindings = new MemoryBindingStore();
	const channel = createWebChannel({ port: 0, announce: false });

	await channel.start({
		auth: createFakeAuthService(),
		emit(event) {
			emitted.push(event);
			return Promise.resolve({
				type: "message_queued",
				sessionKey: event.sessionKey,
				eventId: event.id,
				queuedMessages: 1,
				text: event.type === "message" ? event.text : "",
			});
		},
		subscribe() {
			return () => {};
		},
		resolveSession(input) {
			return bindings.resolve(input);
		},
		getGatewayActions() {
			return [];
		},
	});

	const address = channel.getAddress();
	assert.ok(address);
	const baseURL = `http://${address.host}:${address.port}`;

	try {
		const rejected = await fetch(`${baseURL}/api/pibo/session`);
		assert.equal(rejected.status, 401);

		const accepted = await fetch(`${baseURL}/api/pibo/session`, {
			headers: { "x-test-user": "user-1" },
		});
		assert.equal(accepted.status, 200);
		const session = await accepted.json();
		assert.equal(session.identity.userId, "user-1");
		assert.equal(session.binding.sessionKey, "web:user-1");
		assert.equal(session.binding.originalProfile, "pibo-minimal");

		const message = await fetch(`${baseURL}/api/pibo/message`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-test-user": "user-1",
			},
			body: JSON.stringify({ text: "hello" }),
		});
		assert.equal(message.status, 200);
		assert.equal(emitted.length, 1);
		assert.equal(emitted[0].sessionKey, "web:user-1");
		assert.equal(emitted[0].text, "hello");
	} finally {
		await channel.stop?.();
	}
});

test("web channel rejects authenticated users that auth marks forbidden", async () => {
	const channel = createWebChannel({ port: 0, announce: false });

	await channel.start({
		auth: {
			name: "forbidden-auth",
			async getSession() {
				throw new PiboAuthError("Forbidden", 403);
			},
			async requireSession() {
				throw new PiboAuthError("Forbidden", 403);
			},
		},
		emit() {
			throw new Error("should not emit");
		},
		subscribe() {
			return () => {};
		},
		resolveSession() {
			throw new Error("should not resolve");
		},
		getGatewayActions() {
			return [];
		},
	});

	const address = channel.getAddress();
	assert.ok(address);

	try {
		const response = await fetch(`http://${address.host}:${address.port}/api/pibo/session`, {
			headers: { "x-test-user": "user-1" },
		});
		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), { error: "Forbidden" });
	} finally {
		await channel.stop?.();
	}
});
