import type {
  JsonSchema,
  JsonSchemaTypeName,
  ValidationResult,
  WorkflowDefinition,
  WorkflowDiagnostic,
  WorkflowNodeDefinition,
  WorkflowPort,
} from "../types/index.js";

const SUPPORTED_SCHEMA_TYPES = new Set<JsonSchemaTypeName>([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "title",
  "description",
  "enum",
  "const",
  "default",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "$defs",
  "$ref",
]);

export type JsonSchemaSubsetValidationOptions = {
  path?: string;
  requireObjectRoot?: boolean;
};

type SchemaValidationContext = {
  rootSchema: JsonSchema;
  diagnostics: WorkflowDiagnostic[];
  seenRefs: Set<string>;
};

export function validateWorkflow(definition: WorkflowDefinition): ValidationResult {
  return validateWorkflowDefinitionSchemas(definition);
}

export function validateWorkflowDefinitionSchemas(definition: WorkflowDefinition): ValidationResult {
  const diagnostics: WorkflowDiagnostic[] = [];

  validateWorkflowPort(definition.input, "$.input", diagnostics);
  validateWorkflowPort(definition.output, "$.output", diagnostics);

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    validateNodeSchemas(nodeId, node, diagnostics);
  }

  for (const [edgeId, edge] of Object.entries(definition.edges)) {
    if (edge.adapter) {
      validateWorkflowPort(edge.adapter.output, `$.edges.${edgeId}.adapter.output`, diagnostics, { edgeId });
    }
  }

  if (definition.state?.global) {
    for (const [path, field] of Object.entries(definition.state.global)) {
      diagnostics.push(
        ...validateJsonSchemaSubset(field.schema, {
          path: `$.state.global.${path}.schema`,
          requireObjectRoot: false,
        }),
      );
    }
  }

  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? { ok: false, diagnostics }
    : { ok: true, diagnostics };
}

export function validateJsonSchemaSubset(schema: JsonSchema, options: JsonSchemaSubsetValidationOptions = {}): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  const context: SchemaValidationContext = {
    rootSchema: schema,
    diagnostics,
    seenRefs: new Set(),
  };

  validateSchemaNode(schema, options.path ?? "$.schema", {
    context,
    root: true,
    requireObjectRoot: options.requireObjectRoot ?? true,
  });

  return diagnostics;
}

export function validateWorkflowPort(
  port: WorkflowPort,
  path: string,
  diagnostics: WorkflowDiagnostic[],
  target: Pick<WorkflowDiagnostic, "nodeId" | "edgeId"> = {},
): void {
  if (port.kind !== "json") {
    return;
  }

  diagnostics.push(
    ...validateJsonSchemaSubset(port.schema, {
      path: `${path}.schema`,
      requireObjectRoot: true,
    }).map((diagnostic) => ({ ...diagnostic, ...target })),
  );
}

function validateNodeSchemas(
  nodeId: string,
  node: WorkflowNodeDefinition,
  diagnostics: WorkflowDiagnostic[],
): void {
  if (node.input) {
    validateWorkflowPort(node.input, `$.nodes.${nodeId}.input`, diagnostics, { nodeId });
  }

  if (node.output) {
    validateWorkflowPort(node.output, `$.nodes.${nodeId}.output`, diagnostics, { nodeId });
  }

  if (node.kind === "human" && node.schema) {
    diagnostics.push(
      ...validateJsonSchemaSubset(node.schema, {
        path: `$.nodes.${nodeId}.schema`,
        requireObjectRoot: true,
      }).map((diagnostic) => ({ ...diagnostic, nodeId })),
    );
  }
}

function validateSchemaNode(
  value: unknown,
  path: string,
  options: { context: SchemaValidationContext; root: boolean; requireObjectRoot: boolean },
): void {
  const { context, root, requireObjectRoot } = options;

  if (!isRecord(value)) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.schemaNotObject",
      message: "JSON schema must be an object in the V1 Structured Outputs subset.",
      path,
      hint: "Use an object JSON Schema with a supported type, properties, and required fields.",
    });
    return;
  }

  const schema = value as JsonSchema;

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.unsupportedSchemaKeyword",
        message: `JSON Schema keyword '${key}' is not supported by the V1 Structured Outputs subset.`,
        path: `${path}.${key}`,
        hint: "Remove the keyword or model the contract with type, properties, items, enum, const, anyOf, $defs, or $ref.",
      });
    }
  }

  if (schema.oneOf !== undefined) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.unsupportedOneOf",
      message: "oneOf is not supported by the V1 Structured Outputs subset.",
      path: `${path}.oneOf`,
      hint: "Use anyOf for supported alternatives, or split the contract into explicit adapter/workflow steps.",
    });
  }

  if (schema.allOf !== undefined) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.unsupportedAllOf",
      message: "allOf is not supported by the V1 Structured Outputs subset.",
      path: `${path}.allOf`,
      hint: "Flatten the schema into one object with explicit properties and required fields.",
    });
  }

  if (schema.$defs !== undefined) {
    if (!isRecord(schema.$defs)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.invalidDefs",
        message: "$defs must be an object keyed by local definition name.",
        path: `${path}.$defs`,
        hint: "Use $defs: { Name: { type: 'object', ... } } for reusable schemas.",
      });
    } else {
      for (const [defName, defSchema] of Object.entries(schema.$defs)) {
        validateSchemaNode(defSchema, `${path}.$defs.${defName}`, {
          context,
          root: false,
          requireObjectRoot: false,
        });
      }
    }
  }

  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== "string") {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.invalidRef",
        message: "$ref must be a string local reference.",
        path: `${path}.$ref`,
        hint: "Use local references such as '#/$defs/MyObject'.",
      });
    } else {
      const refTarget = resolveLocalRef(context.rootSchema, schema.$ref);
      if (!refTarget) {
        addDiagnostic(context, {
          code: "WorkflowInterfaceError.unresolvedRef",
          message: `JSON Schema reference '${schema.$ref}' could not be resolved.`,
          path: `${path}.$ref`,
          hint: "Only local $defs references are supported in V1, for example '#/$defs/MyObject'.",
        });
      } else if (!context.seenRefs.has(schema.$ref)) {
        context.seenRefs.add(schema.$ref);
        validateSchemaNode(refTarget, `${path}.$ref(${schema.$ref})`, {
          context,
          root,
          requireObjectRoot,
        });
        context.seenRefs.delete(schema.$ref);
      }
    }
  }

  if (schema.type === undefined && schema.$ref === undefined && schema.anyOf === undefined) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.schemaTypeMissing",
      message: "JSON schemas must declare a supported type unless they are local $ref or anyOf wrappers.",
      path: `${path}.type`,
      hint: "Add type: 'object', 'array', 'string', 'number', 'integer', 'boolean', or 'null'.",
    });
  }

  const schemaTypes = validateSchemaType(schema, path, context);

  if (root && schema.anyOf !== undefined) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.rootAnyOf",
      message: "Root anyOf is not supported for workflow structured output schemas.",
      path: `${path}.anyOf`,
      hint: "Use a root object and place anyOf inside a property or $defs entry.",
    });
  }

  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.invalidAnyOf",
        message: "anyOf must be a non-empty array of schema objects.",
        path: `${path}.anyOf`,
        hint: "Provide one or more supported schema alternatives.",
      });
    } else {
      schema.anyOf.forEach((item, index) => {
        validateSchemaNode(item, `${path}.anyOf.${index}`, {
          context,
          root: false,
          requireObjectRoot: false,
        });
      });
    }
  }

  if (root && requireObjectRoot && !schema.$ref && !schemaTypes.includes("object")) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.rootMustBeObject",
      message: "Structured workflow JSON schemas must have an object root in V1.",
      path: `${path}.type`,
      hint: "Wrap scalar or array values in an object property, e.g. { type: 'object', properties: { value: ... }, required: ['value'], additionalProperties: false }.",
    });
  }

  const hasObjectShape = schemaTypes.includes("object") || schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined;
  if (hasObjectShape) {
    validateObjectSchema(schema, path, context);
  }

  if (schemaTypes.includes("array")) {
    if (schema.items === undefined) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.arrayMissingItems",
        message: "Array schemas must declare an items schema.",
        path: `${path}.items`,
        hint: "Add items with another supported V1 schema.",
      });
    } else {
      validateSchemaNode(schema.items, `${path}.items`, {
        context,
        root: false,
        requireObjectRoot: false,
      });
    }
  }

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.invalidEnum",
      message: "enum must be an array of JSON values.",
      path: `${path}.enum`,
      hint: "Use enum: ['one', 'two'] or remove the enum constraint.",
    });
  }
}

function validateSchemaType(schema: JsonSchema, path: string, context: SchemaValidationContext): JsonSchemaTypeName[] {
  if (schema.type === undefined) {
    return [];
  }

  const values = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (values.length === 0) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.emptyType",
      message: "Schema type arrays must include at least one supported type.",
      path: `${path}.type`,
      hint: "Use a supported type such as 'object', or a nullable pair such as ['string', 'null'].",
    });
    return [];
  }

  const seen = new Set<string>();
  const validTypes: JsonSchemaTypeName[] = [];
  values.forEach((typeName, index) => {
    if (!SUPPORTED_SCHEMA_TYPES.has(typeName)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.unsupportedSchemaType",
        message: `Schema type '${String(typeName)}' is not supported by the V1 Structured Outputs subset.`,
        path: Array.isArray(schema.type) ? `${path}.type.${index}` : `${path}.type`,
        hint: "Use one of string, number, integer, boolean, object, array, or null.",
      });
      return;
    }

    if (seen.has(typeName)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.duplicateSchemaType",
        message: `Schema type '${typeName}' is duplicated.`,
        path: Array.isArray(schema.type) ? `${path}.type.${index}` : `${path}.type`,
        hint: "List each schema type only once.",
      });
      return;
    }

    seen.add(typeName);
    validTypes.push(typeName);
  });

  return validTypes;
}

function validateObjectSchema(schema: JsonSchema, path: string, context: SchemaValidationContext): void {
  if (schema.additionalProperties !== false) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.objectAdditionalProperties",
      message: "Object schemas must set additionalProperties: false in the V1 Structured Outputs subset.",
      path: `${path}.additionalProperties`,
      hint: "Add additionalProperties: false to every object schema.",
    });
  }

  if (schema.properties !== undefined && !isRecord(schema.properties)) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.invalidProperties",
      message: "Object schema properties must be an object.",
      path: `${path}.properties`,
      hint: "Use properties: { fieldName: { type: 'string' } }.",
    });
    return;
  }

  const propertyEntries = Object.entries(schema.properties ?? {});
  if (propertyEntries.length > 0 && !Array.isArray(schema.required)) {
    addDiagnostic(context, {
      code: "WorkflowInterfaceError.objectRequiredMissing",
      message: "Object schemas must list every property in required.",
      path: `${path}.required`,
      hint: "Set required to exactly the object property names; use nullable types for optional semantics.",
    });
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  const requiredSet = new Set(required);
  for (const [propertyName, propertySchema] of propertyEntries) {
    if (!requiredSet.has(propertyName)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.objectPropertyNotRequired",
        message: `Object property '${propertyName}' must be listed in required.`,
        path: `${path}.required`,
        hint: "Structured Outputs requires every object field to be required; use a union with null for nullable fields.",
      });
    }

    validateSchemaNode(propertySchema, `${path}.properties.${propertyName}`, {
      context,
      root: false,
      requireObjectRoot: false,
    });
  }

  for (const requiredName of required) {
    if (typeof requiredName !== "string") {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.invalidRequiredEntry",
        message: "required entries must be strings.",
        path: `${path}.required`,
        hint: "List required property names as strings.",
      });
      continue;
    }

    if (schema.properties && !Object.hasOwn(schema.properties, requiredName)) {
      addDiagnostic(context, {
        code: "WorkflowInterfaceError.requiredUnknownProperty",
        message: `Required property '${requiredName}' is not declared in properties.`,
        path: `${path}.required`,
        hint: "Remove the unknown required name or add a matching property schema.",
      });
    }
  }
}

function resolveLocalRef(rootSchema: JsonSchema, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#/$defs/")) {
    return undefined;
  }

  const name = ref.slice("#/$defs/".length);
  if (name.length === 0) {
    return undefined;
  }

  return rootSchema.$defs?.[name];
}

function addDiagnostic(
  context: SchemaValidationContext,
  diagnostic: Omit<WorkflowDiagnostic, "severity"> & { severity?: WorkflowDiagnostic["severity"] },
): void {
  context.diagnostics.push({
    severity: "error",
    ...diagnostic,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
