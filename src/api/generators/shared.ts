import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Oas, Operation, ParameterObject } from "@mihari/oas";

import { MihariError } from "../../shared/utils/errors.ts";

export interface GeneratedFile {
  /** Path relative to the output directory. */
  path: string;
  content: string;
  mode?: number;
}

export interface GenerateResult {
  files: GeneratedFile[];
}

export async function writeGenerated(
  result: GenerateResult,
  outDir: string,
  options: { force?: boolean } = {},
): Promise<string[]> {
  const written: string[] = [];
  for (const file of result.files) {
    const absolute = join(outDir, file.path);
    if (!options.force && existsSync(absolute)) {
      throw new MihariError(
        `File already exists: ${absolute}. Pass --force to overwrite.`,
        "GEN_FILE_EXISTS",
      );
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
    if (file.mode !== undefined) await chmod(absolute, file.mode);
    written.push(absolute);
  }
  return written;
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

export function sanitizeIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || "op";
}

export function pascalCase(raw: string): string {
  return raw
    .replace(/[-_/]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((s) => `${s[0]!.toUpperCase()}${s.slice(1)}`)
    .join("");
}

export function kebabCase(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function snakeCase(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

/** Python-safe snake_case identifier that dodges reserved keywords. */
export function pythonSafeIdentifier(raw: string): string {
  const id = snakeCase(raw).replace(/[^a-zA-Z0-9_]/g, "_");
  return PY_KEYWORDS.has(id) ? `${id}_` : id;
}

/** PascalCase identifier suitable for exported Go symbols. */
export function goExportedIdentifier(raw: string): string {
  return pascalCase(raw).replace(/[^a-zA-Z0-9_]/g, "");
}

/** camelCase identifier: first char lowercase, no separators. */
export function camelCase(raw: string): string {
  const pascal = pascalCase(raw);
  return pascal.length > 0 ? pascal[0]!.toLowerCase() + pascal.slice(1) : pascal;
}

export function clientClassNameFromTitle(title: string | undefined): string {
  if (!title) return "ApiClient";
  return `${pascalCase(title.trim())}Client`;
}

/* -------------------------------------------------------------------------- */
/* Path conversions                                                           */
/* -------------------------------------------------------------------------- */

/** OpenAPI `/pets/{id}` → Hono `/pets/:id`. */
export function openApiPathToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/** Replace `{param}` with stub value suitable for blackbox tests. */
export function openApiPathToStubbed(
  path: string,
  stubs: Record<string, string> = {},
): string {
  return path.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = stubs[name] ?? `stub-${kebabCase(name)}`;
    return encodeURIComponent(value);
  });
}

/** Emits the JS template string that fills path parameters from `input.path`. */
export function honoClientPathTemplate(path: string): string {
  return path.replace(
    /\{([^}]+)\}/g,
    (_, name) => "${encodeURIComponent(input.path." + name + ")}",
  );
}

/* -------------------------------------------------------------------------- */
/* Schema -> TypeScript                                                       */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER = "unknown";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function refToName(ref: string): string | null {
  const match = ref.match(/#\/components\/schemas\/(.+)$/);
  return match ? pascalCase(match[1]!) : null;
}

/**
 * Minimal JSON Schema → TypeScript type emitter. Covers the shapes most
 * commonly found in OpenAPI specs. Anything it doesn't know about becomes
 * `unknown` so the output always compiles.
 */
export interface SchemaToTsOptions {
  /**
   * Namespace prefix for `$ref`-resolved names. When set, `#/components/schemas/Foo`
   * emits `Namespace.Foo` so the caller can import types as `import * as
   * Schemas from "./types.js"`.
   */
  refNamespace?: string;
}

export function schemaToTs(schema: unknown, options: SchemaToTsOptions = {}): string {
  if (!isObject(schema)) return PLACEHOLDER;

  if (typeof schema.$ref === "string") {
    const name = refToName(schema.$ref);
    if (!name) return PLACEHOLDER;
    return options.refNamespace ? `${options.refNamespace}.${name}` : name;
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ") || PLACEHOLDER;
  }

  const composition =
    Array.isArray(schema.oneOf)
      ? schema.oneOf
      : Array.isArray(schema.anyOf)
        ? schema.anyOf
        : null;
  if (composition && composition.length > 0) {
    return composition.map((s) => schemaToTs(s, options)).join(" | ");
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return schema.allOf.map((s) => schemaToTs(s, options)).join(" & ");
  }

  const type = schema.type;
  if (type === "string") return "string";
  if (type === "boolean") return "boolean";
  if (type === "integer" || type === "number") return "number";
  if (type === "null") return "null";
  if (type === "array") {
    return `${schemaToTs(schema.items, options)}[]`;
  }
  if (type === "object" || isObject(schema.properties)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    const entries = Object.entries(properties);
    if (!entries.length) return "Record<string, unknown>";
    const body = entries
      .map(([name, propSchema]) => {
        const optional = required.has(name) ? "" : "?";
        return `  ${safeKey(name)}${optional}: ${schemaToTs(propSchema, options)};`;
      })
      .join("\n");
    return `{\n${body}\n}`;
  }

  return PLACEHOLDER;
}

function safeKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/* -------------------------------------------------------------------------- */
/* Operation-level helpers                                                    */
/* -------------------------------------------------------------------------- */

export interface NormalisedOperation {
  operation: Operation;
  operationId: string;
  safeId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: ParameterObject[];
  pathParams: ParameterObject[];
  queryParams: ParameterObject[];
  headerParams: ParameterObject[];
  requestBodySchema: unknown;
  requestBodyRequired: boolean;
  requestBodyContentType: string | null;
  successResponse: {
    status: string;
    schema: unknown;
    contentType: string | null;
  } | null;
}

export function normaliseOperation(op: Operation): NormalisedOperation {
  const parameters = op.getParameters();
  const pathParams = parameters.filter((p) => p.in === "path");
  const queryParams = parameters.filter((p) => p.in === "query");
  const headerParams = parameters.filter((p) => p.in === "header");

  const rawBody = op.getRequestBody();
  const bodyContentType = op.getRequestBodyMediaTypes()[0] ?? null;
  const bodySchema =
    rawBody && isObject(rawBody.content) && bodyContentType
      ? (rawBody.content as Record<string, unknown>)[bodyContentType]
      : null;
  const requestBodySchema = isObject(bodySchema)
    ? (bodySchema as { schema?: unknown }).schema
    : null;

  const statusCodes = op.getResponseStatusCodes();
  const successStatus =
    statusCodes.find((s) => /^2\d\d$/.test(s)) ?? statusCodes[0] ?? null;
  let successResponse: NormalisedOperation["successResponse"] = null;
  if (successStatus) {
    const response = op.getResponseByStatusCode(successStatus);
    if (response && isObject(response.content)) {
      const contentType = Object.keys(response.content)[0] ?? null;
      const media = contentType
        ? (response.content as Record<string, unknown>)[contentType]
        : null;
      const schema = isObject(media) ? (media as { schema?: unknown }).schema : null;
      successResponse = { status: successStatus, contentType, schema };
    } else {
      successResponse = { status: successStatus, contentType: null, schema: null };
    }
  }

  return {
    operation: op,
    operationId: op.getOperationId(),
    safeId: sanitizeIdentifier(op.getOperationId()),
    method: op.getMethod(),
    path: op.getPath(),
    summary: op.getSummary(),
    description: op.getDescription(),
    parameters,
    pathParams,
    queryParams,
    headerParams,
    requestBodySchema,
    requestBodyRequired: op.hasRequiredRequestBody(),
    requestBodyContentType: bodyContentType,
    successResponse,
  };
}

export function listOperations(oas: Oas): NormalisedOperation[] {
  return oas.getPaths().map(normaliseOperation);
}

export function specTitle(oas: Oas): string {
  const info = oas.getInfo();
  return typeof info.title === "string" ? info.title : "API";
}

/* -------------------------------------------------------------------------- */
/* components.schemas iteration                                               */
/* -------------------------------------------------------------------------- */

export function iterSchemas(oas: Oas): Array<{ name: string; schema: unknown }> {
  const doc = oas.getDefinition();
  if (!isObject(doc.components)) return [];
  const schemas = (doc.components as Record<string, unknown>).schemas;
  if (!isObject(schemas)) return [];
  return Object.entries(schemas).map(([name, schema]) => ({
    name: pascalCase(name),
    schema,
  }));
}

/* -------------------------------------------------------------------------- */
/* Schema -> Zod                                                              */
/* -------------------------------------------------------------------------- */

export interface SchemaToZodOptions {
  /** Wrap primitive types with `z.coerce.*` — needed for query/path params. */
  coerce?: boolean;
}

export function schemaToZod(schema: unknown, options: SchemaToZodOptions = {}): string {
  if (!isObject(schema)) return "z.unknown()";

  if (typeof schema.$ref === "string") {
    // Generator runs on dereferenced docs, so surviving refs are rare.
    return "z.unknown()";
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const allStrings = schema.enum.every((v) => typeof v === "string");
    if (allStrings) {
      return `z.enum([${schema.enum.map((v) => JSON.stringify(v)).join(", ")}] as const)`;
    }
    return `z.union([${schema.enum.map((v) => `z.literal(${JSON.stringify(v)})`).join(", ")}])`;
  }

  const composition = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : null;
  if (composition && composition.length) {
    const parts = composition.map((s) => schemaToZod(s, options));
    return parts.length === 1 ? (parts[0] as string) : `z.union([${parts.join(", ")}])`;
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const parts = schema.allOf.map((s) => schemaToZod(s, options));
    if (parts.length === 1) return parts[0] as string;
    return parts.reduce((left, right) => `z.intersection(${left}, ${right})`);
  }

  const type = schema.type;
  let base = "z.unknown()";
  switch (type) {
    case "string":
      base = "z.string()";
      break;
    case "integer":
      base = options.coerce ? "z.coerce.number().int()" : "z.number().int()";
      break;
    case "number":
      base = options.coerce ? "z.coerce.number()" : "z.number()";
      break;
    case "boolean":
      base = options.coerce ? "z.coerce.boolean()" : "z.boolean()";
      break;
    case "null":
      base = "z.null()";
      break;
    case "array":
      base = `z.array(${schemaToZod(schema.items, options)})`;
      break;
    case "object": {
      const properties = isObject(schema.properties) ? schema.properties : {};
      const entries = Object.entries(properties);
      if (!entries.length) {
        base = "z.object({}).passthrough()";
        break;
      }
      const required = new Set(
        Array.isArray(schema.required) ? (schema.required as string[]) : [],
      );
      const lines = entries.map(([name, prop]) => {
        let expr = schemaToZod(prop, options);
        if (!required.has(name)) expr = `${expr}.optional()`;
        return `    ${safeKey(name)}: ${expr}`;
      });
      base = `z.object({\n${lines.join(",\n")},\n  })`;
      break;
    }
    default:
      base = "z.unknown()";
  }

  if (schema.nullable === true) base = `${base}.nullable()`;
  return base;
}

export function renderZodRequestSchema(op: NormalisedOperation): string {
  const lines: string[] = [
    `  path: ${buildPathSchema(op)}`,
    `  query: ${buildQuerySchema(op)}`,
  ];
  if (op.requestBodySchema) {
    const bodyExpr = schemaToZod(op.requestBodySchema);
    const wrapped = op.requestBodyRequired ? bodyExpr : `${bodyExpr}.optional()`;
    lines.push(`  body: ${wrapped}`);
  } else {
    lines.push(`  body: z.unknown().optional()`);
  }
  return `z.object({\n${lines.join(",\n")},\n}).passthrough()`;
}

function buildPathSchema(op: NormalisedOperation): string {
  if (!op.pathParams.length) return "z.object({})";
  const entries = op.pathParams.map((p) => {
    const expr = schemaToZod(p.schema, { coerce: true });
    return `    ${safeKey(p.name)}: ${expr}`;
  });
  return `z.object({\n${entries.join(",\n")},\n  })`;
}

function buildQuerySchema(op: NormalisedOperation): string {
  if (!op.queryParams.length) return "z.object({}).passthrough()";
  const entries = op.queryParams.map((p) => {
    let expr = schemaToZod(p.schema, { coerce: true });
    if (!p.required) expr = `${expr}.optional()`;
    return `    ${safeKey(p.name)}: ${expr}`;
  });
  return `z.object({\n${entries.join(",\n")},\n  }).passthrough()`;
}

/**
 * Walks every declared response on an operation, picking the JSON (or first
 * available) media type and returning `{ status, schema }` pairs. Schema is
 * `null` when the response had no content or no `schema` under `content.*`.
 */
export function iterResponses(
  op: NormalisedOperation,
): Array<{ status: string; schema: unknown }> {
  const out: Array<{ status: string; schema: unknown }> = [];
  for (const status of op.operation.getResponseStatusCodes()) {
    const response = op.operation.getResponseByStatusCode(status);
    if (!response || !isObject(response.content)) {
      out.push({ status, schema: null });
      continue;
    }
    const types = Object.keys(response.content);
    const chosen = types.find((t) => /json/i.test(t)) ?? types[0];
    const media = chosen
      ? (response.content as Record<string, unknown>)[chosen]
      : null;
    const schema = isObject(media)
      ? ((media as { schema?: unknown }).schema ?? null)
      : null;
    out.push({ status, schema });
  }
  return out;
}

export function renderZodResponsesRecord(op: NormalisedOperation): string {
  const entries = iterResponses(op).map(({ status, schema }) => {
    const expr = schema === null ? "z.unknown()" : schemaToZod(schema);
    return `  ${JSON.stringify(status)}: ${expr}`;
  });
  if (!entries.length) return "{}";
  return `{\n${entries.join(",\n")},\n}`;
}

/* -------------------------------------------------------------------------- */
/* Schema -> typed language references                                        */
/* -------------------------------------------------------------------------- */

/**
 * Returns the `Name` portion of a `#/components/schemas/Name` ref, or null when
 * the ref points elsewhere (parameters, responses…).
 */
export function refToSchemaName(ref: string): string | null {
  const match = ref.match(/^#\/components\/schemas\/(.+)$/);
  return match ? pascalCase(match[1]!) : null;
}

export function schemaIsRef(schema: unknown): string | null {
  if (!isObject(schema)) return null;
  const ref = schema.$ref;
  return typeof ref === "string" ? refToSchemaName(ref) : null;
}

/** `{ type: array, items: $ref }` → name of the referenced component, else null. */
export function schemaIsArrayOfRef(schema: unknown): string | null {
  if (!isObject(schema)) return null;
  if (schema.type !== "array") return null;
  return schemaIsRef(schema.items);
}

/* ---- Rust (serde) ---- */

export function schemaToRust(schema: unknown): string {
  if (!isObject(schema)) return "serde_json::Value";
  const refName = schemaIsRef(schema);
  if (refName) return refName;
  if (Array.isArray(schema.enum)) return "String";
  switch (schema.type) {
    case "string":
      return "String";
    case "integer":
      return "i64";
    case "number":
      return "f64";
    case "boolean":
      return "bool";
    case "array":
      return `Vec<${schemaToRust(schema.items)}>`;
    case "object":
      return "serde_json::Value";
    default:
      return "serde_json::Value";
  }
}

/* ---- Java (Jackson) ---- */

export function schemaToJava(schema: unknown): string {
  if (!isObject(schema)) return "Object";
  const refName = schemaIsRef(schema);
  if (refName) return refName;
  if (Array.isArray(schema.enum)) return "String";
  switch (schema.type) {
    case "string":
      return "String";
    case "integer":
      return "Integer";
    case "number":
      return "Double";
    case "boolean":
      return "Boolean";
    case "array": {
      const inner = schemaToJava(schema.items);
      return `java.util.List<${inner}>`;
    }
    case "object":
      return "Object";
    default:
      return "Object";
  }
}

/* ---- PHP ---- */

export function schemaToPhp(schema: unknown): string {
  if (!isObject(schema)) return "mixed";
  const refName = schemaIsRef(schema);
  if (refName) return refName;
  if (Array.isArray(schema.enum)) return "string";
  switch (schema.type) {
    case "string":
      return "string";
    case "integer":
      return "int";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "array":
      return "array";
    case "object":
      return "array";
    default:
      return "mixed";
  }
}
