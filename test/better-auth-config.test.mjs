import assert from "node:assert/strict";
import test from "node:test";
import { createBetterAuthService } from "../dist/auth/better-auth.js";

const validOptions = {
	baseURL: "http://localhost:4788",
	secret: "x".repeat(32),
	googleClientId: "google-client-id",
	googleClientSecret: "google-client-secret",
	allowedEmails: ["you@example.com"],
};

test("better auth requires an allowed email allowlist", () => {
	assert.throws(
		() =>
			createBetterAuthService({
				...validOptions,
				allowedEmails: [],
			}),
		/PIBO_AUTH_ALLOWED_EMAILS must contain at least one email/,
	);
});

test("better auth requires a strong secret", () => {
	assert.throws(
		() =>
			createBetterAuthService({
				...validOptions,
				secret: "too-short",
			}),
		/BETTER_AUTH_SECRET must be at least 32 characters/,
	);
});
