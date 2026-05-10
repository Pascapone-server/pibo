import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { piboHomePath } from "./pibo-home.js";
import type { InitialSessionContext, ModelProfile } from "./profiles.js";
import { isPiboThinkingLevel, type PiboThinkingLevel } from "./thinking.js";

export const DEFAULT_PIBO_MODEL_DEFAULTS_PATH = "model-defaults.json";

export type PiboModelDefaults = {
	main?: ModelProfile;
	subagent?: ModelProfile;
	thinking?: PiboThinkingLevel;
	mainThinking?: PiboThinkingLevel;
	subagentThinking?: PiboThinkingLevel;
	fast?: boolean;
	mainFast?: boolean;
	subagentFast?: boolean;
};

export function selectRequestedModelProfile(
	profile: InitialSessionContext,
	defaults: PiboModelDefaults = {},
): ModelProfile | undefined {
	if (profile.model) return cloneModelProfile(profile.model);
	if (profile.parentSessionId) return cloneModelProfile(profile.subagentModel ?? defaults.subagent);
	return cloneModelProfile(profile.mainModel ?? defaults.main);
}

export function selectRequestedThinkingLevel(
	profile: InitialSessionContext,
	defaults: PiboModelDefaults = {},
): PiboThinkingLevel | undefined {
	if (profile.parentSessionId) return profile.subagentThinkingLevel ?? profile.thinkingLevel ?? defaults.subagentThinking ?? defaults.thinking;
	return profile.mainThinkingLevel ?? profile.thinkingLevel ?? defaults.mainThinking ?? defaults.thinking;
}

export function selectRequestedFastMode(
	profile: InitialSessionContext,
	defaults: PiboModelDefaults = {},
): boolean | undefined {
	if (profile.parentSessionId) return profile.subagentFast ?? profile.fast ?? defaults.subagentFast ?? defaults.fast;
	return profile.mainFast ?? profile.fast ?? defaults.mainFast ?? defaults.fast;
}

export function loadPiboModelDefaults(
	cwd = process.cwd(),
	path?: string,
): PiboModelDefaults {
	const resolvedPath = path ? resolve(cwd, path) : piboHomePath(DEFAULT_PIBO_MODEL_DEFAULTS_PATH);
	if (!existsSync(resolvedPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(resolvedPath, "utf-8")) as unknown;
		return sanitizePiboModelDefaults(parsed);
	} catch {
		return {};
	}
}

export function savePiboModelDefaults(
	defaults: PiboModelDefaults,
	cwd = process.cwd(),
	path?: string,
): PiboModelDefaults {
	const sanitized = sanitizePiboModelDefaults(defaults);
	const resolvedPath = path ? resolve(cwd, path) : piboHomePath(DEFAULT_PIBO_MODEL_DEFAULTS_PATH);
	mkdirSync(dirname(resolvedPath), { recursive: true });
	writeFileSync(resolvedPath, `${JSON.stringify(sanitized, null, 2)}\n`);
	return sanitized;
}

export function sanitizePiboModelDefaults(value: unknown): PiboModelDefaults {
	const raw = value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
	return {
		main: sanitizeModelProfile(raw.main),
		subagent: sanitizeModelProfile(raw.subagent),
		thinking: sanitizeThinkingLevel(raw.thinking),
		mainThinking: sanitizeThinkingLevel(raw.mainThinking),
		subagentThinking: sanitizeThinkingLevel(raw.subagentThinking),
		fast: sanitizeBoolean(raw.fast),
		mainFast: sanitizeBoolean(raw.mainFast),
		subagentFast: sanitizeBoolean(raw.subagentFast),
	};
}

export function sanitizeThinkingLevel(value: unknown): PiboThinkingLevel | undefined {
	if (typeof value !== "string") return undefined;
	return isPiboThinkingLevel(value) ? value : undefined;
}

export function sanitizeModelProfile(value: unknown): ModelProfile | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const raw = value as Record<string, unknown>;
	if (typeof raw.provider !== "string" || typeof raw.id !== "string") return undefined;
	const provider = raw.provider.trim();
	const id = raw.id.trim();
	if (!provider || !id) return undefined;
	return { provider, id };
}

function cloneModelProfile(model: ModelProfile | undefined): ModelProfile | undefined {
	return model ? { ...model } : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}
