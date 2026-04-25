import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvLine(line: string): [string, string] | undefined {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) return undefined;

	const equalsIndex = trimmed.indexOf("=");
	if (equalsIndex === -1) return undefined;

	const key = trimmed.slice(0, equalsIndex).trim();
	let value = trimmed.slice(equalsIndex + 1).trim();
	if (!key) return undefined;

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return [key, value];
}

export function loadDotEnv(path = ".env"): void {
	const resolvedPath = resolve(path);
	if (!existsSync(resolvedPath)) return;

	const content = readFileSync(resolvedPath, "utf-8");
	for (const line of content.split(/\r?\n/)) {
		const entry = parseEnvLine(line);
		if (!entry) continue;
		const [key, value] = entry;
		process.env[key] ??= value;
	}
}
