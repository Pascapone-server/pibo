import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InMemorySessionBindingStore, createSessionBinding } from "../dist/sessions/bindings.js";
import { SqliteSessionBindingStore } from "../dist/sessions/sqlite-store.js";

test("session binding builder applies default identity rules", () => {
	const binding = createSessionBinding(
		{
			channel: "web",
			externalId: "user-1",
			defaultProfile: "pibo-minimal",
			workspace: "/workspace",
		},
		"2026-04-28T00:00:00.000Z",
	);

	assert.equal(binding.sessionKey, "web:user-1");
	assert.match(binding.sessionId, /^[0-9a-f-]{36}$/);
	assert.equal(binding.originalProfile, "pibo-minimal");
	assert.equal(binding.workspace, "/workspace");
	assert.equal(binding.createdAt, "2026-04-28T00:00:00.000Z");
	assert.equal(binding.updatedAt, "2026-04-28T00:00:00.000Z");
});

test("in-memory session binding store creates and reuses channel bindings", () => {
	const store = new InMemorySessionBindingStore();

	const first = store.resolve({
		channel: "local-tui",
		externalId: "pibo-minimal:default",
		sessionKey: "local-tui:pibo-minimal:default",
		defaultProfile: "pibo-minimal",
	});
	const second = store.resolve({
		channel: "local-tui",
		externalId: "pibo-minimal:default",
		sessionKey: "local-tui:ignored",
		defaultProfile: "pibo-example-plugin",
	});

	assert.equal(first.sessionKey, "local-tui:pibo-minimal:default");
	assert.equal(second.sessionKey, first.sessionKey);
	assert.equal(second.sessionId, first.sessionId);
	assert.equal(second.originalProfile, "pibo-minimal");
	assert.deepEqual(store.get(first.sessionKey), second);
});

test("sqlite session binding store creates and reuses channel bindings", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pibo-bindings-"));
	const dbPath = join(dir, "bindings.sqlite");
	const store = new SqliteSessionBindingStore(dbPath);

	try {
		const first = store.resolve({
			channel: "web",
			externalId: "user-1",
			defaultProfile: "pibo-minimal",
		});
		const second = store.resolve({
			channel: "web",
			externalId: "user-1",
			defaultProfile: "pibo-example-plugin",
		});

		assert.equal(first.sessionKey, "web:user-1");
		assert.match(first.sessionId, /^[0-9a-f-]{36}$/);
		assert.equal(second.sessionKey, first.sessionKey);
		assert.equal(second.sessionId, first.sessionId);
		assert.equal(second.originalProfile, "pibo-minimal");
		assert.deepEqual(store.get(first.sessionKey), second);
	} finally {
		store.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("sqlite session binding store persists parent session identity", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pibo-bindings-"));
	const dbPath = join(dir, "bindings.sqlite");
	const store = new SqliteSessionBindingStore(dbPath);

	try {
		const parent = store.resolve({
			channel: "chat-web",
			externalId: "yield-qa",
			defaultProfile: "run-yield-qa",
		});
		const child = store.resolve({
			channel: "subagent",
			externalId: "chat-web:yield-qa::sub::qa-researcher::thread-1",
			sessionKey: "chat-web:yield-qa::sub::qa-researcher::thread-1",
			parentSessionKey: parent.sessionKey,
			parentSessionId: parent.sessionId,
			defaultProfile: "pibo-minimal",
		});

		assert.equal(child.parentSessionKey, parent.sessionKey);
		assert.equal(child.parentSessionId, parent.sessionId);
		assert.notEqual(child.sessionId, child.sessionKey);
		assert.equal(child.sessionId.length, 36);
	} finally {
		store.close();
		await rm(dir, { recursive: true, force: true });
	}
});
