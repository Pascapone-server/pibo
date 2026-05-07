import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { PiboGatewayServer } from "../dist/gateway/server.js";
import { encodeFrame } from "../dist/gateway/protocol.js";

async function freePort() {
	const server = net.createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	return address.port;
}

function connectClient(port) {
	const socket = net.connect({ host: "127.0.0.1", port });
	const lines = [];
	let buffer = "";
	socket.setEncoding("utf8");
	socket.on("data", (chunk) => {
		buffer += chunk;
		let index = buffer.indexOf("\n");
		while (index !== -1) {
			const line = buffer.slice(0, index).trim();
			buffer = buffer.slice(index + 1);
			if (line) lines.push(JSON.parse(line));
			index = buffer.indexOf("\n");
		}
	});
	return new Promise((resolve, reject) => {
		socket.once("connect", () => resolve({ socket, lines }));
		socket.once("error", reject);
	});
}

async function waitFor(predicate, label) {
	const deadline = Date.now() + 1_000;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.fail(`Timed out waiting for ${label}`);
}

async function withGateway(options, fn) {
	const port = await freePort();
	const server = new PiboGatewayServer({ host: "127.0.0.1", port, startChannels: false, persistSession: false, ...options });
	await server.start();
	try {
		await fn(server, port);
	} finally {
		await server.stop();
	}
}

function broadcast(server, event) {
	server.broadcastRouterEvent(event);
}

test("legacy clients receive all router events and session subscriptions filter events", async () => {
	await withGateway({}, async (server, port) => {
		const legacy = await connectClient(port);
		const subscribed = await connectClient(port);

		subscribed.socket.write(encodeFrame({
			type: "subscribe",
			id: "sub-1",
			subscription: { type: "session", piboSessionId: "session-a" },
		}));
		await waitFor(() => subscribed.lines.some((line) => line.type === "res" && line.id === "sub-1" && line.ok), "subscribe response");

		broadcast(server, { type: "message_started", piboSessionId: "session-a", text: "a" });
		broadcast(server, { type: "message_started", piboSessionId: "session-b", text: "b" });

		await waitFor(() => legacy.lines.filter((line) => line.type === "event").length === 2, "legacy events");
		await waitFor(() => subscribed.lines.filter((line) => line.type === "event").length === 1, "subscribed event");

		const legacySessionIds = legacy.lines.filter((line) => line.type === "event").map((line) => line.payload.piboSessionId);
		assert.deepEqual(legacySessionIds, ["session-a", "session-b"]);

		const subscribedEvents = subscribed.lines.filter((line) => line.type === "event");
		assert.equal(subscribedEvents[0].payload.piboSessionId, "session-a");

		legacy.socket.destroy();
		subscribed.socket.destroy();
	});
});

test("droppable router events are bounded and counted while a socket is slow", async () => {
	await withGateway({ maxBackpressureFrames: 2, maxBackpressureBytes: 10_000 }, async (server, port) => {
		const client = await connectClient(port);
		await waitFor(() => server.getDiagnostics().connections === 1, "accepted connection");

		const connection = [...server.connections][0];
		connection.socket.write = () => false;

		for (let i = 0; i < 10; i += 1) {
			broadcast(server, { type: "assistant_delta", piboSessionId: "slow-session", text: "x".repeat(100) });
		}

		const diagnostics = server.getDiagnostics();
		assert.equal(diagnostics.connections, 1);
		assert.equal(diagnostics.slowConnections, 1);
		assert.ok(diagnostics.droppedEvents > 0);
		assert.ok(diagnostics.connectionDetails[0].queuedFrames <= 2);

		client.socket.destroy();
	});
});

test("non-droppable frames are not dropped when backpressure limits are exceeded", async () => {
	await withGateway({ maxBackpressureFrames: 1, maxBackpressureBytes: 10_000 }, async (server, port) => {
		const client = await connectClient(port);
		await waitFor(() => server.getDiagnostics().connections === 1, "accepted connection");

		const connection = [...server.connections][0];
		connection.socket.write = () => false;
		connection.send({ type: "res", id: "res-1", ok: true, payload: {} });
		connection.send({ type: "res", id: "res-2", ok: true, payload: {} });

		const diagnostics = server.getDiagnostics();
		assert.equal(diagnostics.droppedEvents, 0);
		assert.equal(diagnostics.connectionDetails[0].closedForBackpressure, true);

		client.socket.destroy();
	});
});
