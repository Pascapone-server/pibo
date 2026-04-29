import assert from "node:assert/strict";
import test from "node:test";
import { InitialSessionContextBuilder } from "../dist/core/profiles.js";
import { inspectPiboProfile } from "../dist/core/runtime.js";
import { PiboSessionRouter } from "../dist/core/session-router.js";
import { createSubagentToolDefinitions, createSubagentToolName } from "../dist/subagents/tool.js";
import { piboCorePlugin } from "../dist/plugins/builtin.js";
import { createDefaultPiboPluginRegistry } from "../dist/plugins/builtin.js";
import { definePiboPlugin, PiboPluginRegistry } from "../dist/plugins/registry.js";
import { InMemoryPiboSessionStore } from "../dist/sessions/store.js";

const noopSubagentRunner = {
	async runSubagent(input) {
		return {
			piboSessionId: "ps_child",
			eventId: "event-1",
			reply: {
				type: "assistant_message",
				piboSessionId: "ps_child",
				eventId: "event-1",
				text: `helper result for ${input.subagent.name}`,
			},
		};
	},
};

test("subagent helpers create stable tool names and reject collisions", () => {
	assert.equal(createSubagentToolName("research-helper"), "pibo_subagent_research_helper");
	assert.equal(createSubagentToolName("Research Helper"), "pibo_subagent_research_helper");
	assert.throws(
		() =>
			createSubagentToolDefinitions(
				[
					{ name: "same-name", targetProfile: "helper-profile" },
					{ name: "same_name", targetProfile: "helper-profile" },
				],
				noopSubagentRunner,
			),
		/Duplicate subagent tool name "pibo_subagent_same_name"/,
	);
});

test("session context builder preserves Pi parent session ids", () => {
	const context = new InitialSessionContextBuilder("child-profile")
		.withSessionId("child-session")
		.withParentSessionId("parent-session")
		.createSession();

	assert.equal(context.sessionId, "child-session");
	assert.equal(context.parentSessionId, "parent-session");
});

test("subagent tool definitions delegate execution to the provided runner", async () => {
	let observed;
	const [tool] = createSubagentToolDefinitions(
		[
			{
				name: "helper",
				description: "Ask the helper agent.",
				targetProfile: "helper-profile",
				executionMode: "parallel",
			},
		],
		{
			async runSubagent(input) {
				observed = input;
				return noopSubagentRunner.runSubagent(input);
			},
		},
	);

	assert.equal(tool.name, "pibo_subagent_helper");
	assert.equal(tool.executionMode, "parallel");

	const result = await tool.execute("tool-call-1", {
		message: "Find the relevant files.",
		threadKey: "files",
	});

	assert.equal(observed.message, "Find the relevant files.");
	assert.equal(observed.threadKey, "files");
	assert.equal(result.details.piboSessionId, "ps_child");
	assert.equal(result.content[0].text, "helper result for helper");
});

test("profiles can expose subagents as active router tools", async () => {
	const registry = PiboPluginRegistry.create({ plugins: [piboCorePlugin] });
	registry.registerPlugin(
		definePiboPlugin({
			id: "test.subagents",
			register(api) {
				api.registerSubagent({
					name: "helper",
					description: "Ask the helper profile.",
					targetProfile: "helper-profile",
				});
				api.registerProfile({
					name: "parent-profile",
					create(context) {
						return new InitialSessionContextBuilder("parent-profile")
							.addSubagent(context.getSubagent("helper"))
							.createSession();
					},
				});
				api.registerProfile({
					name: "helper-profile",
					create() {
						return new InitialSessionContextBuilder("helper-profile").createSession();
					},
				});
			},
		}),
	);

	const store = new InMemoryPiboSessionStore();
	store.create({
		id: "ps_parent",
		piSessionId: "parent-session",
		channel: "pibo.test",
		kind: "chat",
		profile: "parent-profile",
		ownerScope: "user:test",
	});
	const router = new PiboSessionRouter({
		persistSession: false,
		pluginRegistry: registry,
		sessionStore: store,
	});

	try {
		const output = await router.emit({
			type: "execution",
			piboSessionId: "ps_parent",
			action: "status",
		});

		assert.equal(output.type, "execution_result");
		assert.equal(output.result.activeTools.includes("pibo_subagent_helper"), true);
	} finally {
		await router.disposeAll();
	}
});

test("default run-yield QA profile exposes run control tools", async () => {
	const registry = createDefaultPiboPluginRegistry();
	const profile = registry.createProfile("run-yield-qa");
	const inspection = await inspectPiboProfile({ profile, persistSession: false });
	const activeTools = new Set(inspection.tools.map((tool) => tool.name));

	assert.deepEqual(
		inspection.subagents.map((subagent) => subagent.name),
		["qa-researcher", "qa-reviewer"],
	);
	assert.equal(activeTools.has("pibo_echo"), true);
	assert.equal(activeTools.has("pibo_workspace_info"), true);
	assert.equal(activeTools.has("pibo_exec"), true);
	assert.equal(activeTools.has("pibo_subagent_qa_researcher"), true);
	assert.equal(activeTools.has("pibo_subagent_qa_reviewer"), true);
	assert.equal(activeTools.has("pibo_run_start"), true);
	assert.equal(activeTools.has("pibo_run_list"), true);
	assert.equal(activeTools.has("pibo_run_wait"), true);
	assert.equal(activeTools.has("pibo_run_read"), true);
	assert.equal(activeTools.has("pibo_run_cancel"), true);
	assert.equal(activeTools.has("pibo_run_ack"), true);
	assert.equal(inspection.subagents.every((subagent) => subagent.active), true);
	assert.equal(inspection.diagnostics.length, 0);
});
