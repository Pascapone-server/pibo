import { inspectPiboProfile, runPiboTui } from "./runtime.js";
import { PiboSessionRouter } from "./session-router.js";

export { createDefaultPiboProfile, InitialSessionContext, InitialSessionContextBuilder } from "./profiles.js";
export type { BuiltinToolsMode, ContextFileProfile, InitialSessionContextOptions, SkillProfile, ToolProfile } from "./profiles.js";
export { createPiboTestToolProfiles } from "./tools.js";
export { createPiboRuntime, inspectPiboProfile, runPiboTui } from "./runtime.js";
export type { PiboProfileInspection, PiboRuntimeOptions } from "./runtime.js";
export { PiboSessionRouter } from "./session-router.js";
export type {
	PiboEventListener,
	PiboEventSource,
	PiboExecutionAction,
	PiboExecutionEvent,
	PiboInputEvent,
	PiboMessageEvent,
	PiboOutputEvent,
	PiboSessionRouterOptions,
	PiboSessionStatus,
} from "./session-router.js";

if (import.meta.url === `file://${process.argv[1]}`) {
	const command = process.argv[2] ?? "profile";

	if (command === "tui") {
		await runPiboTui();
	} else if (command === "profile") {
		const inspection = await inspectPiboProfile();
		console.log(JSON.stringify(inspection, null, 2));
	} else if (command === "router") {
		const router = new PiboSessionRouter({ persistSession: false });
		const event = await router.emit({
			type: "execution",
			sessionKey: process.argv[3] ?? "demo",
			action: "status",
		});
		console.log(JSON.stringify(event, null, 2));
		await router.disposeAll();
	} else {
		console.error(`Unknown command: ${command}`);
		process.exitCode = 1;
	}
}
