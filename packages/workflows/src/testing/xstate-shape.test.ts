import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKFLOW_XSTATE_ACTOR_SOURCES,
  WORKFLOW_XSTATE_CANCEL_EVENT,
  WORKFLOW_XSTATE_NODE_DONE_EVENT,
  WORKFLOW_XSTATE_PROJECTION_KIND,
  WORKFLOW_XSTATE_PROJECTION_VERSION,
  WORKFLOW_XSTATE_RESUME_EVENT,
  WORKFLOW_XSTATE_TERMINAL_STATE_IDS,
  createXStateMachineProjection,
  createXStateProjectionContextShape,
  minimalOneNodePiboAgentWorkflowFixture,
  mixedNodeWorkflowFixture,
  projectWorkflowEdgesToXState,
  projectWorkflowNodesToXState,
  projectWorkflowToXStateProjection,
  workflowFixtureRegistryRefs,
  xstateActorIdForNode,
  xstateStateIdForNode,
  xstateTransferEdgeActionId,
  xstateTransitionIdForEdge,
} from "../index.js";
import type { XStateProjectionState } from "../index.js";

describe("XState projection shape", () => {
  it("defines a versioned Pibo-owned machine projection shape", () => {
    const contextShape = createXStateProjectionContextShape({
      global: {
        topic: {
          schema: { type: "string" },
          description: "Shared topic.",
        },
      },
      local: {
        draft: {
          reads: ["global.topic"],
          writes: ["local.notes"],
        },
      },
      edge: {
        "draft-to-review": {
          reads: ["edge.payload"],
        },
      },
    });

    const draftState: XStateProjectionState = {
      id: xstateStateIdForNode("draft"),
      kind: "node",
      nodeId: "draft",
      type: "atomic",
      actorId: xstateActorIdForNode("draft"),
      invoke: {
        id: xstateActorIdForNode("draft"),
        src: "pibo.workflow.actor.agent",
        input: { kind: "nodeInput", nodeId: "draft" },
      },
      tags: ["agent"],
      meta: {
        pibo: {
          kind: "node",
          nodeId: "draft",
          nodeKind: "agent",
          actorId: xstateActorIdForNode("draft"),
          description: "Draft the answer.",
        },
      },
    };

    const projection = createXStateMachineProjection({
      id: "example.workflow",
      version: "1.0.0",
      initial: draftState.id,
      states: {
        [draftState.id]: draftState,
      },
      transitions: [
        {
          event: "WORKFLOW.NODE.DONE",
          source: draftState.id,
          target: WORKFLOW_XSTATE_TERMINAL_STATE_IDS.completed,
          edgeId: "draft-to-review",
          guard: "guards.accepted",
          actions: ["actions.transferEdge"],
          meta: {
            pibo: {
              edgeId: "draft-to-review",
              edgeKind: "data",
              guardRef: "guards.accepted",
            },
          },
        },
      ],
      actors: {
        [xstateActorIdForNode("draft")]: {
          id: xstateActorIdForNode("draft"),
          src: "pibo.workflow.actor.agent",
          nodeId: "draft",
          kind: "agent",
          input: { kind: "nodeInput", nodeId: "draft" },
        },
      },
      guards: {
        "guards.accepted": {
          id: "guards.accepted",
          ref: "guards.accepted",
          edgeId: "draft-to-review",
        },
      },
      actions: {
        "actions.transferEdge": {
          id: "actions.transferEdge",
          kind: "transferEdge",
          edgeId: "draft-to-review",
          durableEffect: true,
        },
      },
      contextShape,
      metadata: { tags: ["example"] },
    });

    assert.equal(projection.kind, WORKFLOW_XSTATE_PROJECTION_KIND);
    assert.equal(projection.schemaVersion, WORKFLOW_XSTATE_PROJECTION_VERSION);
    assert.equal(projection.contextShape.durableTruth, "kernel");
    assert.equal(projection.contextShape.exposesPrivatePayloads, false);
    assert.deepEqual(projection.finalStates, WORKFLOW_XSTATE_TERMINAL_STATE_IDS);
    assert.deepEqual(projection.config.meta.pibo.snapshotKinds, ["kernel", "xstate", "ui"]);
    assert.equal(projection.config.meta.pibo.workflowVersion, "1.0.0");
    assert.deepEqual(projection.config.states[draftState.id]?.on?.["WORKFLOW.NODE.DONE"], {
      target: WORKFLOW_XSTATE_TERMINAL_STATE_IDS.completed,
      guard: "guards.accepted",
      actions: ["actions.transferEdge"],
      meta: {
        pibo: {
          edgeId: "draft-to-review",
          edgeKind: "data",
          guardRef: "guards.accepted",
        },
      },
    });
    assert.equal(projection.transitions[0]?.meta?.pibo.edgeId, "draft-to-review");
  });

  it("maps workflow nodes to deterministic state and actor projections", () => {
    const nodeProjection = projectWorkflowNodesToXState(mixedNodeWorkflowFixture);

    assert.equal(nodeProjection.initial, xstateStateIdForNode("plan"));
    assert.deepEqual(Object.keys(nodeProjection.states), [
      "node.child-summary",
      "node.draft",
      "node.normalize",
      "node.plan",
      "node.review",
    ]);
    assert.deepEqual(Object.keys(nodeProjection.actors), [
      "workflow.node.child-summary",
      "workflow.node.draft",
      "workflow.node.normalize",
      "workflow.node.plan",
      "workflow.node.review",
    ]);

    const draftState = nodeProjection.states[xstateStateIdForNode("draft")];
    assert.equal(draftState?.kind, "node");
    assert.equal(draftState?.nodeId, "draft");
    assert.equal(draftState?.actorId, xstateActorIdForNode("draft"));
    assert.equal(draftState?.invoke?.src, WORKFLOW_XSTATE_ACTOR_SOURCES.agent);
    assert.deepEqual(draftState?.invoke?.input, { kind: "nodeInput", nodeId: "draft" });
    assert.deepEqual(draftState?.tags, ["agent"]);
    assert.equal(draftState?.meta?.pibo.nodeKind, "agent");

    assert.equal(nodeProjection.states[xstateStateIdForNode("plan")]?.invoke?.src, WORKFLOW_XSTATE_ACTOR_SOURCES.code);
    assert.equal(nodeProjection.states[xstateStateIdForNode("review")]?.invoke?.src, WORKFLOW_XSTATE_ACTOR_SOURCES.human);
    assert.equal(
      nodeProjection.states[xstateStateIdForNode("normalize")]?.invoke?.src,
      WORKFLOW_XSTATE_ACTOR_SOURCES.adapter,
    );

    const nestedActor = nodeProjection.actors[xstateActorIdForNode("child-summary")];
    assert.equal(nestedActor?.src, WORKFLOW_XSTATE_ACTOR_SOURCES.workflow);
    assert.equal(nestedActor?.childWorkflowId, "fixture.nested-child");
    assert.equal(nestedActor?.childWorkflowVersion, "1.0.0");

    assert.ok(nodeProjection.contextShape.global.topic);
    assert.deepEqual(nodeProjection.contextShape.local.plan, {
      reads: ["global.topic"],
      writes: ["global.plan"],
    });
  });

  it("projects a workflow definition into a machine with node states and edge transitions", () => {
    const projection = projectWorkflowToXStateProjection(minimalOneNodePiboAgentWorkflowFixture);

    assert.equal(projection.id, "fixture.minimal-pibo-agent");
    assert.equal(projection.initial, xstateStateIdForNode("answer"));
    assert.equal(projection.states[xstateStateIdForNode("answer")]?.nodeId, "answer");
    assert.equal(projection.actors[xstateActorIdForNode("answer")]?.kind, "agent");
    assert.deepEqual(projection.transitions, []);
    assert.equal(projection.config.initial, xstateStateIdForNode("answer"));
    const answerInvoke = projection.config.states[xstateStateIdForNode("answer")]?.invoke;
    assert.ok(answerInvoke && !Array.isArray(answerInvoke));
    assert.equal(answerInvoke.id, xstateActorIdForNode("answer"));
    assert.ok(projection.config.states[WORKFLOW_XSTATE_TERMINAL_STATE_IDS.completed]);
  });

  it("maps workflow edges to deterministic XState transitions and transfer actions", () => {
    const edgeProjection = projectWorkflowEdgesToXState(mixedNodeWorkflowFixture);

    assert.deepEqual(
      edgeProjection.transitions.map((transition) => transition.id),
      [
        xstateTransitionIdForEdge("draft-to-review"),
        xstateTransitionIdForEdge("normalize-to-child"),
        xstateTransitionIdForEdge("plan-to-draft"),
        xstateTransitionIdForEdge("review-to-normalize"),
      ],
    );

    const planTransition = edgeProjection.transitions.find((transition) => transition.edgeId === "plan-to-draft");
    assert.deepEqual(planTransition, {
      id: xstateTransitionIdForEdge("plan-to-draft"),
      event: WORKFLOW_XSTATE_NODE_DONE_EVENT,
      source: xstateStateIdForNode("plan"),
      target: xstateStateIdForNode("draft"),
      edgeId: "plan-to-draft",
      actions: [xstateTransferEdgeActionId("plan-to-draft")],
      meta: {
        pibo: {
          edgeId: "plan-to-draft",
          edgeKind: "data",
        },
      },
    });
    assert.deepEqual(edgeProjection.actions[xstateTransferEdgeActionId("plan-to-draft")], {
      id: xstateTransferEdgeActionId("plan-to-draft"),
      kind: "transferEdge",
      edgeId: "plan-to-draft",
      durableEffect: true,
    });

    const adapterTransition = edgeProjection.transitions.find((transition) => transition.edgeId === "normalize-to-child");
    assert.equal(adapterTransition?.meta?.pibo.adapterRef, workflowFixtureRegistryRefs.adapters.draftToSummary);

    const resumeTransition = edgeProjection.transitions.find((transition) => transition.edgeId === "review-to-normalize");
    assert.equal(resumeTransition?.event, WORKFLOW_XSTATE_RESUME_EVENT);
    assert.equal(resumeTransition?.guard, workflowFixtureRegistryRefs.guards.approved);
    assert.deepEqual(resumeTransition?.meta?.pibo, {
      edgeId: "review-to-normalize",
      edgeKind: "resume",
      guardRef: workflowFixtureRegistryRefs.guards.approved,
      priority: 1,
    });

    const projection = projectWorkflowToXStateProjection(mixedNodeWorkflowFixture);
    assert.equal(projection.transitions.length, 4);
    assert.equal(projection.actions[xstateTransferEdgeActionId("plan-to-draft")]?.kind, "transferEdge");
    assert.deepEqual(projection.config.states[xstateStateIdForNode("plan")]?.on?.[WORKFLOW_XSTATE_NODE_DONE_EVENT], {
      target: xstateStateIdForNode("draft"),
      actions: [xstateTransferEdgeActionId("plan-to-draft")],
      meta: {
        pibo: {
          edgeId: "plan-to-draft",
          edgeKind: "data",
        },
      },
    });
    assert.deepEqual(projection.config.states[xstateStateIdForNode("review")]?.on?.[WORKFLOW_XSTATE_RESUME_EVENT], {
      target: xstateStateIdForNode("normalize"),
      guard: workflowFixtureRegistryRefs.guards.approved,
      actions: [xstateTransferEdgeActionId("review-to-normalize")],
      meta: {
        pibo: {
          edgeId: "review-to-normalize",
          edgeKind: "resume",
          guardRef: workflowFixtureRegistryRefs.guards.approved,
          priority: 1,
        },
      },
    });
  });

  it("exposes stable event names for future wait/cancel mappings", () => {
    assert.equal(WORKFLOW_XSTATE_NODE_DONE_EVENT, "WORKFLOW.NODE.DONE");
    assert.equal(WORKFLOW_XSTATE_RESUME_EVENT, "WORKFLOW.RESUME");
    assert.equal(WORKFLOW_XSTATE_CANCEL_EVENT, "WORKFLOW.CANCEL");
  });
});
