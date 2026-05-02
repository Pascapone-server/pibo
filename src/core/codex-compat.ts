import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import type { ProviderWebSearchOptions, ToolPackageProfile } from "./profiles.js";

export type CodexCompatibleWebSearchConfig = {
	external_web_access: boolean;
	filters?: {
		allowed_domains?: string[];
		blocked_domains?: string[];
	};
	user_location?: {
		type: "approximate";
		country?: string;
		region?: string;
		city?: string;
		timezone?: string;
	};
	search_context_size?: "low" | "medium" | "high";
	include_sources?: boolean;
};

export type CodexCompatExtensionOptions = {
	shell?: string;
	isChildSession?: boolean;
	webSearch?: CodexCompatibleWebSearchConfig;
};

type ProviderPayload = {
	input?: unknown;
	tools?: unknown;
	include?: unknown;
	[key: string]: unknown;
};

const CODEX_COMPAT_SUBAGENTS = ["default", "explorer", "worker"] as const;
const WEB_SEARCH_SOURCES_INCLUDE = "web_search_call.action.sources";

function currentDate(): string {
	return new Date().toISOString().slice(0, 10);
}

function currentTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function hasProviderResponsesShape(payload: unknown): payload is ProviderPayload {
	return Boolean(payload && typeof payload === "object" && "input" in payload);
}

function hasWebSearchTool(tools: unknown[]): boolean {
	return tools.some((tool) => {
		if (!tool || typeof tool !== "object") return false;
		const type = (tool as { type?: unknown }).type;
		return type === "web_search_preview" || type === "web_search";
	});
}

function isValidDomainFilter(value: string): boolean {
	const domain = value.trim();
	return domain.length > 0 && !domain.includes("://") && !/[/?#\s]/.test(domain);
}

function normalizedDomainFilters(values: readonly string[] | undefined): string[] | undefined {
	const domains = values?.map((value) => value.trim()).filter(isValidDomainFilter) ?? [];
	return domains.length > 0 ? domains : undefined;
}

function normalizedLocation(
	location: ProviderWebSearchOptions["userLocation"],
): CodexCompatibleWebSearchConfig["user_location"] | undefined {
	if (!location) return undefined;
	const country = location.country?.trim();
	const region = location.region?.trim();
	const city = location.city?.trim();
	const timezone = location.timezone?.trim();
	if (!country && !region && !city && !timezone) return undefined;
	return {
		type: "approximate",
		...(country ? { country } : {}),
		...(region ? { region } : {}),
		...(city ? { city } : {}),
		...(timezone ? { timezone } : {}),
	};
}

export function normalizeCodexCompatWebSearchConfig(
	toolPackages: Pick<ToolPackageProfile, "providerWebSearch" | "providerWebSearchOptions">,
): CodexCompatibleWebSearchConfig | undefined {
	if (toolPackages.providerWebSearch !== true) return undefined;

	const options = toolPackages.providerWebSearchOptions ?? {};
	const allowedDomains = normalizedDomainFilters(options.allowedDomains);
	const blockedDomains = normalizedDomainFilters(options.blockedDomains);
	const userLocation = normalizedLocation(options.userLocation);

	return {
		external_web_access: options.externalWebAccess ?? true,
		search_context_size: options.searchContextSize ?? "medium",
		include_sources: options.includeSources ?? true,
		...(allowedDomains || blockedDomains
			? {
					filters: {
						...(allowedDomains ? { allowed_domains: allowedDomains } : {}),
						...(blockedDomains ? { blocked_domains: blockedDomains } : {}),
					},
				}
			: {}),
		...(userLocation ? { user_location: userLocation } : {}),
	};
}

function buildWebSearchProviderTool(config: CodexCompatibleWebSearchConfig): Record<string, unknown> {
	const tool: Record<string, unknown> = {
		type: "web_search",
		external_web_access: config.external_web_access,
	};
	if (config.search_context_size) tool.search_context_size = config.search_context_size;
	if (config.user_location) tool.user_location = config.user_location;
	if (config.filters?.allowed_domains?.length || config.filters?.blocked_domains?.length) {
		tool.filters = {
			...(config.filters.allowed_domains?.length ? { allowed_domains: config.filters.allowed_domains } : {}),
			...(config.filters.blocked_domains?.length ? { blocked_domains: config.filters.blocked_domains } : {}),
		};
	}
	return tool;
}

function addWebSearchSourcesInclude(
	payload: ProviderPayload,
	config: CodexCompatibleWebSearchConfig,
): Pick<ProviderPayload, "include"> {
	if (!config.include_sources) return {};
	const include = Array.isArray(payload.include) ? [...payload.include] : [];
	if (!include.includes(WEB_SEARCH_SOURCES_INCLUDE)) include.push(WEB_SEARCH_SOURCES_INCLUDE);
	return { include };
}

export function addCodexCompatWebSearchProviderTool(
	payload: unknown,
	config: CodexCompatibleWebSearchConfig,
): unknown {
	if (!hasProviderResponsesShape(payload)) return payload;

	const tools = Array.isArray(payload.tools) ? [...payload.tools] : [];
	if (hasWebSearchTool(tools)) return payload;

	return {
		...payload,
		...addWebSearchSourcesInclude(payload, config),
		tools: [...tools, buildWebSearchProviderTool(config)],
	};
}

export function buildCodexCompatSystemPrompt(options: {
	baseSystemPrompt: string;
	cwd: string;
	shell: string;
	currentDate?: string;
	timezone?: string;
	isChildSession?: boolean;
	webSearchMode?: "local" | "provider";
}): string {
	const childInstructions = options.isChildSession
		? [
				"## Delegated Child Agent",
				"You are a child agent working as part of a team. Complete the delegated task, continue the thread when the parent sends more input, and return a concise final result for the parent agent.",
			].join("\n")
		: "";

	const compatibilityInstructions = [
		"# Codex-Compatible Runtime",
		"You are running in Pibo through the codex-compat profile. Match Codex-style tool use where the exposed Pibo tools support it, while staying truthful about implemented behavior.",
		"Use Pibo's pibo_run_* tools and generated pibo_subagent_* tools for parallel work, yielded runs, and child-agent lifecycle management.",
		"Use direct execution for normal coding tasks. If a structured planning or user-input tool is not present, ask concise questions in normal chat.",
		options.webSearchMode === "provider"
			? "Web search is provided by OpenAI Responses hosted web_search through the active model provider."
			: "Web search is exposed as a normal Pibo tool so calls and results are visible in the session trace.",
		childInstructions,
		"<environment_context>",
		`  <cwd>${options.cwd}</cwd>`,
		`  <shell>${options.shell}</shell>`,
		`  <current_date>${options.currentDate ?? currentDate()}</current_date>`,
		`  <timezone>${options.timezone ?? currentTimezone()}</timezone>`,
		`  <subagents>${CODEX_COMPAT_SUBAGENTS.join(", ")}</subagents>`,
		"</environment_context>",
		options.baseSystemPrompt,
	];

	return compatibilityInstructions.filter((section) => section.trim().length > 0).join("\n\n");
}

export function createCodexCompatExtension(options: CodexCompatExtensionOptions = {}): ExtensionFactory {
	return (pi) => {
		pi.on("before_agent_start", (event, ctx) => ({
			systemPrompt: buildCodexCompatSystemPrompt({
				baseSystemPrompt: event.systemPrompt,
				cwd: ctx.cwd,
				shell: options.shell ?? process.env.SHELL ?? "bash",
				isChildSession: options.isChildSession,
				webSearchMode: options.webSearch ? "provider" : "local",
			}),
		}));

		if (options.webSearch) {
			pi.on("before_provider_request", (event) =>
				addCodexCompatWebSearchProviderTool(event.payload, options.webSearch!),
			);
		}
	};
}
