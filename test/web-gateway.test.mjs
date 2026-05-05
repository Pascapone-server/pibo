import assert from "node:assert/strict";
import test from "node:test";
import { resolveFallbackWebGatewayServerOptions } from "../dist/gateway/fallback.js";
import { resolveWebGatewayAuthMode, resolveWebGatewayServerOptions } from "../dist/gateway/web.js";

test("web gateway binds publicly when auth base URL is not loopback", () => {
	const options = resolveWebGatewayServerOptions({
		auth: { baseURL: "http://192.168.1.10:4788" },
	});

	assert.equal(options.web.host, "0.0.0.0");
});

test("web gateway keeps loopback bind for local auth base URL", () => {
	const options = resolveWebGatewayServerOptions({
		auth: { baseURL: "http://localhost:4788" },
	});

	assert.equal(options.web.host, "127.0.0.1");
});

test("web gateway respects explicit web host", () => {
	const options = resolveWebGatewayServerOptions({
		auth: { baseURL: "http://192.168.1.10:4788" },
		web: { host: "192.168.1.10" },
	});

	assert.equal(options.web.host, "192.168.1.10");
});

test("fallback gateway uses dedicated public ports", () => {
	const options = resolveFallbackWebGatewayServerOptions();

	assert.equal(options.host, "0.0.0.0");
	assert.equal(options.port, 4790);
	assert.deepEqual(options.web, { host: "0.0.0.0", port: 4791 });
});

test("gateway web fails closed when legacy dev auth env is set", () => {
	const previous = process.env.PIBO_DEV_AUTH;
	process.env.PIBO_DEV_AUTH = "1";
	try {
		assert.throws(() => resolveWebGatewayAuthMode({}), /no longer activates dev auth/);
	} finally {
		if (previous === undefined) delete process.env.PIBO_DEV_AUTH;
		else process.env.PIBO_DEV_AUTH = previous;
	}
});

test("gateway web does not enable dev auth by default", () => {
	assert.equal(resolveWebGatewayAuthMode({}), "better-auth");
});
