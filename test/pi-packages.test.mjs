import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectPiPackageSource, parsePiPackageSource } from "../dist/pi-packages/metadata.js";
import { findPiPackage, listPiPackages, removePiPackage, upsertPiPackage } from "../dist/pi-packages/store.js";

test("pi package source parser accepts pi.dev package URLs", async () => {
	const parsed = await parsePiPackageSource("https://pi.dev/packages/@ollama/pi-web-search");

	assert.equal(parsed.kind, "npm");
	assert.equal(parsed.name, "@ollama/pi-web-search");
	assert.equal(parsed.installSpec, "npm:@ollama/pi-web-search");
});

test("pi package source parser rejects non-pi.dev URLs", async () => {
	await assert.rejects(
		parsePiPackageSource("https://example.com/packages/pi-web-access"),
		/Unsupported Pi package URL/,
	);
});

test("pi package inspect discovers local package resources", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pibo-pi-package-"));
	const packageDir = join(cwd, "local-package");
	mkdirSync(join(packageDir, "skills"), { recursive: true });
	mkdirSync(join(packageDir, "extensions"), { recursive: true });
	writeFileSync(join(packageDir, "skills", "demo.md"), "# Demo\n", "utf-8");
	writeFileSync(join(packageDir, "extensions", "demo.js"), "export default {}\n", "utf-8");
	writeFileSync(join(packageDir, "package.json"), JSON.stringify({
		name: "local-pi-package",
		version: "1.2.3",
		description: "Local package fixture",
		pi: {
			skills: ["skills/*.md"],
			extensions: ["extensions/*.js"],
		},
	}), "utf-8");

	const inspected = await inspectPiPackageSource(packageDir, cwd);

	assert.equal(inspected.name, "local-pi-package");
	assert.equal(inspected.version, "1.2.3");
	assert.deepEqual(inspected.resourceTypes, ["extension", "skill"]);
	assert.equal(inspected.installed, true);
});

test("pi package store upserts, finds, lists, and removes packages", () => {
	const cwd = mkdtempSync(join(tmpdir(), "pibo-pi-package-store-"));
	const pkg = upsertPiPackage({
		id: "demo-package",
		name: "demo-package",
		source: "/tmp/demo-package",
		installSpec: "/tmp/demo-package",
		resourceTypes: ["extension"],
		installed: true,
		diagnostics: [],
	}, cwd);

	assert.equal(findPiPackage("demo-package", cwd)?.id, pkg.id);
	assert.deepEqual(listPiPackages(cwd).map((item) => item.name), ["demo-package"]);
	assert.equal(removePiPackage("demo-package", cwd)?.id, "demo-package");
	assert.deepEqual(listPiPackages(cwd), []);
});
