import { existsSync } from "node:fs";
import type { AgentSessionRuntimeDiagnostic } from "@mariozechner/pi-coding-agent";
import type { InitialSessionContext } from "../core/profiles.js";
import { findPiPackage } from "./store.js";

export type PiboPiPackageRuntimeOptions = {
	additionalExtensionPaths: string[];
	diagnostics: AgentSessionRuntimeDiagnostic[];
};

export function getPiPackageRuntimeOptions(cwd: string, profile: InitialSessionContext): PiboPiPackageRuntimeOptions {
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const additionalExtensionPaths: string[] = [];

	for (const selected of profile.piPackages.filter((pkg) => pkg.enabled !== false)) {
		const registered = findPiPackage(selected.name, cwd) ?? findPiPackage(selected.source, cwd);
		if (!registered) {
			diagnostics.push({
				type: "error",
				message: `Selected Pi package "${selected.name}" is not registered in Pibo.`,
			});
			continue;
		}
		if (registered.installSpec.startsWith("/") && !existsSync(registered.installSpec)) {
			diagnostics.push({
				type: "error",
				message: `Selected Pi package "${registered.name}" path does not exist: ${registered.installSpec}`,
			});
			continue;
		}
		additionalExtensionPaths.push(registered.installSpec);
		diagnostics.push({
			type: "info",
			message: `Loaded Pi package ${registered.name} (${registered.resourceTypes.join(", ") || "resources pending"})`,
		});
		for (const diagnostic of registered.diagnostics) {
			if (diagnostic.type === "error") {
				diagnostics.push({ type: "warning", message: `Pi package ${registered.name}: ${diagnostic.message}` });
			}
		}
	}

	return {
		additionalExtensionPaths: [...new Set(additionalExtensionPaths)],
		diagnostics,
	};
}
