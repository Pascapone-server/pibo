import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isJsonPort, isTextPort, json, text } from "../index.js";
import type { JsonSchema, WorkflowPort } from "../index.js";

const articleSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string" },
  },
  required: ["title", "body"],
  additionalProperties: false,
};

describe("workflow port authoring helpers", () => {
  it("creates text ports with optional descriptions", () => {
    assert.deepEqual(text(), { kind: "text" });
    assert.deepEqual(text("Plain user prompt."), {
      kind: "text",
      description: "Plain user prompt.",
    });
  });

  it("creates JSON ports with schema contracts and optional descriptions", () => {
    const port = json(articleSchema, "Article payload.");

    assert.deepEqual(port, {
      kind: "json",
      schema: articleSchema,
      description: "Article payload.",
    });
  });

  it("narrows ports by kind", () => {
    const ports: WorkflowPort[] = [text(), json(articleSchema)];

    assert.equal(isTextPort(ports[0]), true);
    assert.equal(isJsonPort(ports[0]), false);
    assert.equal(isTextPort(ports[1]), false);
    assert.equal(isJsonPort(ports[1]), true);
  });
});
