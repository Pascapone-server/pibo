export type PiPackageResourceType = "extension" | "skill" | "prompt" | "theme";

export type PiboPiPackageDiagnostic = {
	type: "info" | "warning" | "error";
	message: string;
};

export type PiboPiPackageInfo = {
	id: string;
	name: string;
	description?: string;
	source: string;
	installSpec: string;
	version?: string;
	repositoryUrl?: string;
	resourceTypes: PiPackageResourceType[];
	extensionPaths?: string[];
	skillNames?: string[];
	promptNames?: string[];
	themeNames?: string[];
	discoveredToolNames?: string[];
	installed: boolean;
	diagnostics: PiboPiPackageDiagnostic[];
	addedAt?: string;
	updatedAt?: string;
};

export type PiboPiPackageStoreData = {
	version: 1;
	packages: PiboPiPackageInfo[];
};
