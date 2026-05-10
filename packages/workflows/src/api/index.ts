import type { JsonSchema, JsonWorkflowPort, TextWorkflowPort, WorkflowPort } from "../types/index.js";

/**
 * Create a text workflow port.
 *
 * Text ports carry plain strings across workflow, node, and adapter boundaries.
 */
export function text(description?: string): TextWorkflowPort {
  return withOptionalDescription({ kind: "text" }, description);
}

/**
 * Create a JSON workflow port backed by a V1 JSON Schema subset contract.
 *
 * The schema is intentionally preserved as part of the workflow IR so validators,
 * compilers, runtime checks, and inspection surfaces all see the same contract.
 */
export function json(schema: JsonSchema, description?: string): JsonWorkflowPort {
  return withOptionalDescription({ kind: "json", schema }, description);
}

export function isTextPort(port: WorkflowPort): port is TextWorkflowPort {
  return port.kind === "text";
}

export function isJsonPort(port: WorkflowPort): port is JsonWorkflowPort {
  return port.kind === "json";
}

function withOptionalDescription<TPort extends WorkflowPort>(port: TPort, description: string | undefined): TPort {
  if (description === undefined) {
    return port;
  }

  return { ...port, description };
}
