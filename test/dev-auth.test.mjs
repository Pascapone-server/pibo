import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackDevAuthRequest } from "../dist/plugins/dev-auth.js";

test("dev auth accepts loopback requests", () => {
	const request = new Request("http://127.0.0.1:4788/api/auth/session", {
		headers: { host: "127.0.0.1:4788" },
	});

	assert.equal(isLoopbackDevAuthRequest(request), true);
});

test("dev auth rejects requests forwarded from public hosts", () => {
	const request = new Request("http://127.0.0.1:4788/api/auth/session", {
		headers: {
			host: "pibo.neuralnexus.me",
			"x-forwarded-host": "pibo.neuralnexus.me",
		},
	});

	assert.equal(isLoopbackDevAuthRequest(request), false);
});
