import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adapterRef,
  adapterWorkflowFixture,
  createWorkflowRegistry,
  hasWorkflowAdapter,
  mixedNodeWorkflowFixture,
  registerWorkflowAdapter,
  resolveWorkflowAdapter,
  validateWorkflow,
  workflowFixtureProviders,
  workflowFixtureRegistryRefs,
} from "../index.js";
import type { AdapterHandler, WorkflowDefinition } from "../index.js";

describe("workflow registry adapter resolution", () => {
  it("registers and resolves deterministic TypeScript adapters by adapter ref", async () => {
    const registry = createWorkflowRegistry(workflowFixtureProviders);
    const ref = adapterRef(workflowFixtureRegistryRefs.adapters.textToTopic);

    assert.equal(hasWorkflowAdapter(registry, ref), true);

    const entry = resolveWorkflowAdapter(registry, ref);
    assert.ok(entry);
    assert.equal(entry.id, workflowFixtureRegistryRefs.adapters.textToTopic);

    const result = await entry.value({ input: "Registry adapters" });
    assert.deepEqual(result.output, { topic: "Registry adapters" });
  });

  it("rejects duplicate adapter registrations unless override is explicit", () => {
    const registry = createWorkflowRegistry();
    const first: AdapterHandler = ({ input }) => ({ output: String(input) });
    const second: AdapterHandler = ({ input }) => ({ output: `override:${String(input)}` });

    registerWorkflowAdapter(registry, "fixture.adapters.duplicate", first);
    assert.throws(
      () => registerWorkflowAdapter(registry, "fixture.adapters.duplicate", second),
      /already registered/,
    );

    const entry = registerWorkflowAdapter(registry, "fixture.adapters.duplicate", second, { override: true });
    assert.equal(entry.value, second);
    assert.equal(resolveWorkflowAdapter(registry, "fixture.adapters.duplicate")?.value, second);
  });

  it("validates edge adapter refs against the Workflow Registry when one is provided", () => {
    const registry = createWorkflowRegistry(workflowFixtureProviders);

    assert.equal(validateWorkflow(adapterWorkflowFixture, { registry }).ok, true);

    const missingRegistryResult = validateWorkflow(adapterWorkflowFixture, { registry: createWorkflowRegistry() });

    assert.equal(missingRegistryResult.ok, false);
    assert.ok(
      missingRegistryResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "WorkflowGraphError.unknownAdapterRef" &&
          diagnostic.edgeId === "collect-to-summarize" &&
          diagnostic.path === "$.edges.collect-to-summarize.adapter.transform.id",
      ),
    );
  });

  it("validates visible adapter node refs against the Workflow Registry when one is provided", () => {
    const registry = createWorkflowRegistry(workflowFixtureProviders);

    assert.equal(validateWorkflow(mixedNodeWorkflowFixture, { registry }).ok, true);

    const definition = structuredClone(mixedNodeWorkflowFixture) as WorkflowDefinition;
    const normalizeNode = definition.nodes.normalize;
    assert.equal(normalizeNode.kind, "adapter");
    if (normalizeNode.kind === "adapter") {
      normalizeNode.handler = adapterRef("fixture.adapters.missing");
    }

    const result = validateWorkflow(definition, { registry });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "WorkflowGraphError.unknownAdapterRef" &&
          diagnostic.nodeId === "normalize" &&
          diagnostic.path === "$.nodes.normalize.handler.id",
      ),
    );
  });
});
