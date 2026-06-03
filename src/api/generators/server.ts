import type { Oas } from "@mihari/oas";

import {
  kebabCase,
  listOperations,
  openApiPathToHono,
  renderZodRequestSchema,
  renderZodResponsesRecord,
  sanitizeIdentifier,
  specTitle,
  type GenerateResult,
  type NormalisedOperation,
} from "./shared.ts";

export interface GenerateServerOptions {
  /** Package name written to package.json. Default: `<title>-server`. */
  packageName?: string;
}

/**
 * Generates a Hono-based Node/Bun HTTP server skeleton. Each operation gets its
 * own handler file and the root `src/index.ts` wires them together. Stubs return
 * HTTP 501 with an echo payload.
 */
export function generateServer(oas: Oas, options: GenerateServerOptions = {}): GenerateResult {
  const title = specTitle(oas);
  const packageName = options.packageName ?? `${kebabCase(title)}-server`;
  const operations = listOperations(oas);

  return {
    files: [
      { path: "package.json", content: renderPackageJson(packageName) },
      { path: "tsconfig.json", content: renderTsconfig() },
      { path: "README.md", content: renderReadme(title, operations) },
      { path: "src/index.ts", content: renderIndex(operations) },
      { path: "src/lib/validate.ts", content: renderValidateLib() },
      ...operations.map((op) => ({
        path: `src/schemas/${op.safeId}.ts`,
        content: renderSchemaFile(op),
      })),
      ...operations.map((op) => ({
        path: `src/handlers/${op.safeId}.ts`,
        content: renderHandler(op),
      })),
    ],
  };
}

function renderValidateLib(): string {
  return `import type { Context } from "hono";
import type { ZodSchema, ZodError } from "zod";

export type ParsedRequest<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Reads the current Hono request and validates it against a Zod schema that
 * must shape \`{ path, query, headers?, body? }\`. Returns either the typed data
 * or a pre-formatted HTTP 400 \`Response\`. Consumers just do:
 *
 *     const parsed = await parseRequest(c, listPetsSchema);
 *     if (!parsed.ok) return parsed.response;
 *     const { query } = parsed.data;
 */
export async function parseRequest<T>(
  c: Context,
  schema: ZodSchema<T>,
): Promise<ParsedRequest<T>> {
  const url = new URL(c.req.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: unknown = undefined;
  if ((c.req.header("content-type") ?? "").includes("application/json")) {
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
  }

  const result = schema.safeParse({
    path: c.req.param(),
    query,
    headers,
    body,
  });

  if (!result.success) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "invalid_request", issues: formatIssues(result.error) },
        400,
      ),
    };
  }

  return { ok: true, data: result.data };
}

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

export type ResponsesRecord = Record<string, ZodSchema<unknown>>;

/**
 * Validates an outgoing response body against the declared schema for that
 * status code. Controlled by the env var \`RESPONSE_VALIDATION\`:
 *
 *   - \`off\`   : skip (shipped in prod)
 *   - \`warn\`  : console.warn on mismatch (default)
 *   - \`throw\` : replace the response with HTTP 500 \`response_schema_violation\`
 *
 * Status codes without a declared schema (e.g. the 501 stubs) pass through
 * untouched so the developer can ship partial implementations.
 */
export function respond(
  c: Context,
  responses: ResponsesRecord,
  status: number,
  body: unknown,
): Response {
  const mode = process.env.RESPONSE_VALIDATION ?? "warn";
  if (mode !== "off") {
    const statusKey = String(status);
    const schema =
      responses[statusKey] ??
      responses[\`\${statusKey[0]}XX\`] ??
      responses["default"];
    if (schema) {
      const result = schema.safeParse(body);
      if (!result.success) {
        const issues = formatIssues(result.error);
        if (mode === "throw") {
          return jsonResponse(
            { error: "response_schema_violation", status, issues },
            500,
          );
        }
        // eslint-disable-next-line no-console
        console.warn(
          \`[response-validation] \${c.req.method} \${c.req.path} -> \${status} violates declared schema\`,
          issues,
        );
      }
    }
  }
  return jsonResponse(body, status);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
`;
}

function renderSchemaFile(op: NormalisedOperation): string {
  return `import { z } from "zod";

/**
 * Request envelope for ${op.operationId} (${op.method.toUpperCase()} ${op.path}).
 * Path + query primitives use \`z.coerce\` because URL values arrive as strings.
 */
export const ${op.safeId}Request = ${renderZodRequestSchema(op)};

export type ${sanitizeIdentifier(op.operationId)}Request = z.infer<typeof ${op.safeId}Request>;

/**
 * One Zod schema per declared response status code. Status codes with no
 * schema declared in the OpenAPI doc fall back to \`z.unknown()\`.
 * The \`respond\` helper validates outgoing bodies against this record.
 */
export const ${op.safeId}Responses = ${renderZodResponsesRecord(op)};
`;
}

function renderPackageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "bun run --watch src/index.ts",
          start: "bun run src/index.ts",
          typecheck: "tsc --noEmit",
        },
        dependencies: {
          hono: "^4.0.0",
          zod: "^3.23.0",
        },
        devDependencies: {
          "@types/bun": "latest",
          typescript: "^5.7.0",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          isolatedModules: true,
          verbatimModuleSyntax: true,
          types: ["bun-types"],
          lib: ["ESNext"],
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n"
  );
}

function renderReadme(title: string, operations: NormalisedOperation[]): string {
  const rows = operations
    .map((op) => `- \`${op.method.toUpperCase()} ${op.path}\` — ${op.operationId}`)
    .join("\n");
  return `# ${title} server\n\nGenerated by \`mihari api generate server\`. Every operation returns HTTP 501 until you flesh out the handler in \`src/handlers/\`.\n\n## Run\n\n\`\`\`sh\nbun install\nbun run dev\n\`\`\`\n\n## Operations\n\n${rows}\n`;
}

function renderIndex(operations: NormalisedOperation[]): string {
  const imports = operations
    .map((op) => `import { ${op.safeId} } from "./handlers/${op.safeId}.ts";`)
    .join("\n");
  const routes = operations
    .map(
      (op) =>
        `app.${op.method}(${JSON.stringify(openApiPathToHono(op.path))}, ${op.safeId});`,
    )
    .join("\n");
  return `import { Hono } from "hono";\n\n${imports}\n\nconst app = new Hono();\n\n${routes}\n\napp.get("/", (c) => c.json({ ok: true, name: "mihari-generated-server" }));\n\n// Bun auto-starts a server when the default export has { port, fetch }.\n// On Node, wrap \`app\` with \`@hono/node-server\` instead.\nexport default {\n  port: Number(process.env.PORT ?? 3000),\n  fetch: app.fetch,\n};\n`;
}

function renderHandler(op: NormalisedOperation): string {
  const header = op.summary
    ? `/**\n * ${op.summary}\n * ${op.method.toUpperCase()} ${op.path}\n */`
    : `/** ${op.method.toUpperCase()} ${op.path} */`;
  const safeName = sanitizeIdentifier(op.operationId);
  const params = op.parameters
    .map((p) => `//   ${p.in} / ${p.name}${p.required ? " (required)" : ""}`)
    .join("\n");
  const paramsComment = params ? `// Parameters:\n${params}\n` : "";
  return `import type { Context } from "hono";
import { parseRequest, respond } from "../lib/validate.ts";
import { ${op.safeId}Request, ${op.safeId}Responses } from "../schemas/${op.safeId}.ts";

${header}
${paramsComment}export async function ${safeName}(c: Context) {
  const parsed = await parseRequest(c, ${op.safeId}Request);
  if (!parsed.ok) return parsed.response;
  // Typed access to the validated input — replace the stub below with your logic.
  // const { path, query, body } = parsed.data;

  // TODO: implement ${op.operationId}
  // Use \`respond(c, ${op.safeId}Responses, <status>, body)\` to get response-schema
  // validation applied based on the RESPONSE_VALIDATION env var (off|warn|throw).
  return respond(c, ${op.safeId}Responses, 501, {
    error: "not_implemented",
    operationId: ${JSON.stringify(op.operationId)},
    method: ${JSON.stringify(op.method.toUpperCase())},
    path: ${JSON.stringify(op.path)},
  });
}
`;
}
