import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChatWebApp } from "../dist/apps/chat/web-app.js";
import { createWebHostChannel } from "../dist/web/channel.js";
import { InMemoryPiboSessionStore } from "../dist/sessions/store.js";
import { createPiboSignalRegistry } from "../dist/signals/registry.js";

function createFakeAuthService() {
	return {
		name: "fake-auth",
		async getSession(headers) {
			const userId = headers.get("x-test-user");
			if (!userId) return undefined;
			return { identity: { userId, email: `${userId}@example.test`, provider: "test" } };
		},
		async requireSession(headers) {
			const session = await this.getSession(headers);
			if (!session) throw new Error("Unauthenticated");
			return session;
		},
	};
}

async function startSignalWebHost() {
	const sessions = new InMemoryPiboSessionStore();
	const signals = createPiboSignalRegistry();
	const storageDir = mkdtempSync(join(tmpdir(), "pibo-chat-signals-"));
	const dataStorePath = join(storageDir, "pibo-chat-v2.sqlite");
	const agentStorePath = join(storageDir, "agents.sqlite");
	const channel = createWebHostChannel({ port: 0, announce: false });
	const listeners = new Set();
	await channel.start({
		auth: createFakeAuthService(),
		emit() { throw new Error("not used"); },
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSession: (id) => sessions.get(id),
		createSession: (input) => sessions.create(input),
		updateSession: (id, input) => sessions.update(id, input),
		deleteSession: (id) => sessions.delete(id),
		findSessions: (input) => sessions.find(input),
		listSessions: () => sessions.list(),
		getGatewayActions: () => [],
		getProfiles: () => [{ name: "test-profile", description: "Test", aliases: [] }],
		getCapabilityCatalog: () => ({ nativeTools: [], skills: [], subagents: [], contextFiles: [], packages: [], piboTools: [], mcpServers: [] }),
		snapshotSignalSession: (id) => signals.snapshotSession(id),
		snapshotSignalTree: (id) => signals.snapshotTree(id),
		subscribeSignalTree: (id, listener) => signals.subscribe(id, listener),
		getWebApps() {
			return [createChatWebApp({ dataStorePath, agentStorePath })];
		},
	});
	const address = channel.getAddress();
	return {
		channel,
		baseURL: `http://${address.host}:${address.port}`,
		sessions,
		signals,
		emitOutput(event) {
			signals.project({ type: "pibo_output", event, session: sessions.get(event.piboSessionId) });
			for (const listener of listeners) listener(event);
		},
	};
}

function createSession(store, id, ownerScope = "user:user-1", parentId) {
	return store.create({ id, channel: "test", kind: parentId ? "subagent" : "runtime", profile: "test-profile", ownerScope, parentId });
}

async function readSseEvents(response, count) {
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const events = [];
	while (events.length < count) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let index;
		while ((index = buffer.indexOf("\n\n")) >= 0) {
			const frame = buffer.slice(0, index);
			buffer = buffer.slice(index + 2);
			const event = frame.match(/^event: (.+)$/m)?.[1];
			const data = frame.match(/^data: (.+)$/m)?.[1];
			if (event && data) events.push({ event, data: JSON.parse(data) });
		}
	}
	await reader.cancel();
	return events;
}

test("chat signal snapshots enforce ownership and include local session state", async () => {
	const { channel, baseURL, sessions, signals } = await startSignalWebHost();
	try {
		const session = createSession(sessions, "ps_signal_root");
		signals.project({ type: "session_created", session });
		signals.project({ type: "session_processing_changed", piboSessionId: session.id, processing: true, queuedMessages: 0 });

		const ok = await fetch(`${baseURL}/api/chat/signals/session/${session.id}`, { headers: { "x-test-user": "user-1" } });
		assert.equal(ok.status, 200);
		const snapshot = await ok.json();
		assert.equal(snapshot.sessions[session.id].isTreeActive, true);

		const denied = await fetch(`${baseURL}/api/chat/signals/session/${session.id}`, { headers: { "x-test-user": "user-2" } });
		assert.equal(denied.status, 404);
	} finally {
		await channel.stop?.();
	}
});

test("chat signal tree snapshot includes descendants", async () => {
	const { channel, baseURL, sessions, signals } = await startSignalWebHost();
	try {
		const root = createSession(sessions, "ps_tree_root");
		const child = createSession(sessions, "ps_tree_child", "user:user-1", root.id);
		const grandchild = createSession(sessions, "ps_tree_grandchild", "user:user-1", child.id);
		for (const session of [root, child, grandchild]) signals.project({ type: "session_created", session });

		const response = await fetch(`${baseURL}/api/chat/signals/tree/${root.id}`, { headers: { "x-test-user": "user-1" } });
		assert.equal(response.status, 200);
		const snapshot = await response.json();
		assert.ok(snapshot.sessions[root.id]);
		assert.ok(snapshot.sessions[child.id]);
		assert.ok(snapshot.sessions[grandchild.id]);
	} finally {
		await channel.stop?.();
	}
});

test("chat signal SSE sends snapshot then monotonic patches", async () => {
	const { channel, baseURL, sessions, signals } = await startSignalWebHost();
	try {
		const session = createSession(sessions, "ps_signal_sse");
		signals.project({ type: "session_created", session });
		const response = await fetch(`${baseURL}/api/chat/signals/events?rootPiboSessionId=${session.id}`, { headers: { "x-test-user": "user-1" } });
		assert.equal(response.status, 200);
		setTimeout(() => signals.project({ type: "queue_changed", piboSessionId: session.id, queuedMessages: 1 }), 10);
		const events = await readSseEvents(response, 2);
		assert.equal(events[0].event, "signal_snapshot");
		assert.equal(events[1].event, "signal_patch");
		assert.equal(events[1].data.fromVersion + 1, events[1].data.toVersion);
	} finally {
		await channel.stop?.();
	}
});


test("chat bootstrap overlays live signal running status", async () => {
	const { channel, baseURL, sessions, signals } = await startSignalWebHost();
	try {
		const session = createSession(sessions, "ps_bootstrap_signal_running");
		signals.project({ type: "session_created", session });
		signals.project({ type: "session_processing_changed", piboSessionId: session.id, processing: true, queuedMessages: 0 });

		const response = await fetch(`${baseURL}/api/chat/bootstrap?piboSessionId=${session.id}`, { headers: { "x-test-user": "user-1" } });
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.sessions.find((node) => node.piboSessionId === session.id)?.status, "running");
	} finally {
		await channel.stop?.();
	}
});

test("chat navigation clears stale indexed running status from settled signal state", async () => {
	const { channel, baseURL, sessions, signals, emitOutput } = await startSignalWebHost();
	try {
		const session = createSession(sessions, "ps_navigation_signal_idle");
		signals.project({ type: "session_created", session });
		await fetch(`${baseURL}/api/chat/bootstrap?piboSessionId=${session.id}`, { headers: { "x-test-user": "user-1" } });
		emitOutput({ type: "message_started", piboSessionId: session.id, eventId: "m1", text: "hi" });
		signals.project({ type: "pibo_output", event: { type: "message_finished", piboSessionId: session.id, eventId: "m1" }, session });
		signals.project({ type: "session_processing_changed", piboSessionId: session.id, processing: false, queuedMessages: 0 });

		const response = await fetch(`${baseURL}/api/chat/navigation?piboSessionId=${session.id}`, { headers: { "x-test-user": "user-1" } });
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.sessions.find((node) => node.piboSessionId === session.id)?.status, "idle");
	} finally {
		await channel.stop?.();
	}
});
