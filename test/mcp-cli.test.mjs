import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = resolve("dist/bin/pibo.js");

test("pibo exposes the MCP CLI as a subcommand", async () => {
	const { stdout } = await execFileAsync("node", [cliPath, "mcp", "--version"]);

	assert.match(stdout, /pibo mcp \(mcp-cli v\d+\.\d+\.\d+\)/);
});

test("pibo mcp config can create, add, show, and remove servers", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pibo-mcp-config-"));
	try {
		const configPath = join(cwd, "mcp_servers.json");

		const init = await execFileAsync("node", [cliPath, "mcp", "config", "init"], { cwd });
		assert.match(init.stdout, /Created MCP config:/);

		const initialConfig = JSON.parse(await readFile(configPath, "utf-8"));
		assert.deepEqual(initialConfig, { mcpServers: {} });

		await execFileAsync(
			"node",
			[
				cliPath,
				"mcp",
				"config",
				"add",
				"demo",
				'{"command":"node","args":["server.js"]}',
			],
			{ cwd },
		);

		const show = await execFileAsync("node", [cliPath, "mcp", "config", "show"], { cwd });
		const shownConfig = JSON.parse(show.stdout);
		assert.deepEqual(shownConfig.mcpServers.demo, {
			command: "node",
			args: ["server.js"],
		});

		await execFileAsync("node", [cliPath, "mcp", "config", "remove", "demo"], { cwd });
		const finalConfig = JSON.parse(await readFile(configPath, "utf-8"));
		assert.deepEqual(finalConfig, { mcpServers: {} });
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("pibo mcp registry can install the browser-use preset without setup", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pibo-mcp-registry-"));
	try {
		const configPath = join(cwd, "mcp_servers.json");
		const env = { ...process.env, PIBO_HOME: join(cwd, "pibo-home") };

		const list = await execFileAsync("node", [cliPath, "mcp", "registry", "list"], { cwd, env });
		assert.match(list.stdout, /browser-use/);

		await execFileAsync(
			"node",
			[
				cliPath,
				"mcp",
				"registry",
				"install",
				"browser-use",
				"--no-setup",
			],
			{ cwd, env },
		);

		const config = JSON.parse(await readFile(configPath, "utf-8"));
		const binDir = process.platform === "win32" ? "Scripts" : "bin";
		const executable = process.platform === "win32" ? "browser-use.exe" : "browser-use";
		assert.deepEqual(config.mcpServers["browser-use"], {
			command: join(cwd, "pibo-home", "mcp-tools", "browser-use", ".venv", binDir, executable),
			args: ["--mcp"],
			env: {
				BROWSER_USE_HEADLESS: "true",
			},
		});
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("pibo mcp registry falls back to headless when headful has no display", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pibo-mcp-registry-headful-"));
	try {
		const configPath = join(cwd, "mcp_servers.json");
		const env = {
			...process.env,
			PIBO_HOME: join(cwd, "pibo-home"),
			DISPLAY: ":8765",
			XAUTHORITY: "",
		};

		const result = await execFileAsync(
			"node",
			[
				cliPath,
				"mcp",
				"registry",
				"install",
				"browser-use",
				"--no-setup",
				"--headful",
			],
			{ cwd, env },
		);

		assert.match(result.stderr, /Falling back to headless mode/);

		const config = JSON.parse(await readFile(configPath, "utf-8"));
		assert.deepEqual(config.mcpServers["browser-use"].env, {
			BROWSER_USE_HEADLESS: "true",
		});
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
