import { defineCommand } from "citty";
import { readFile } from "node:fs/promises";

import type { Oas, Operation } from "@mihari/oas";

import {
  getCurrentContext,
  type AuthConfig,
  type ContextConfig,
} from "../../shared/context/config.ts";
import { loadContextSpec } from "../../shared/context/store.ts";
import { applyAuth, sendHttpRequest } from "../../shared/core/http.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

export const callCommand = defineCommand({
  meta: {
    name: "call",
    description: "Execute an operation from the current context's OpenAPI spec",
  },
  args: {
    operation: {
      type: "positional",
      required: true,
      description: "operationId, or `METHOD /path`",
    },
    param: {
      type: "string",
      alias: "p",
      description: "Parameter value: --param name=value (comma-separate multiple pairs)",
    },
    header: {
      type: "string",
      alias: "H",
      description: "Extra request header: --header X-Trace=abc",
    },
    body: {
      type: "string",
      alias: "b",
      description: "Request body (JSON string, or @path/to/file)",
    },
    "dry-run": {
      type: "boolean",
      description: "Print the request without sending it",
      default: false,
    },
    "include-headers": {
      type: "boolean",
      alias: "i",
      description: "Print response headers in the output",
      default: false,
    },
  },
  async run({ args }) {
    const ctx = await getCurrentContext();
    if (!ctx) {
      throw new MihariError(
        "No current context. Run `mihari context add <name> --spec <path>` first.",
      );
    }
    const oas = await loadContextSpec(ctx.name, ctx.config);
    const operation = oas.findOperation(args.operation);
    if (!operation) {
      throw new MihariError(
        `Operation "${args.operation}" not found in context "${ctx.name}"`,
        "OPERATION_NOT_FOUND",
      );
    }

    const request = await buildRequest(oas, operation, ctx.config, {
      paramSpec: args.param,
      headerSpec: args.header,
      bodySpec: args.body,
    });

    if (args["dry-run"]) {
      process.stdout.write(`${request.method} ${request.url}\n`);
      for (const [k, v] of Object.entries(request.headers)) {
        process.stdout.write(`${k}: ${v}\n`);
      }
      if (request.body) process.stdout.write(`\n${request.body}\n`);
      return;
    }

    const response = await sendHttpRequest(request);
    if (args["include-headers"]) {
      process.stdout.write(`HTTP ${response.status}\n`);
      for (const [k, v] of Object.entries(response.headers)) {
        process.stdout.write(`${k}: ${v}\n`);
      }
      process.stdout.write("\n");
    }

    process.stdout.write(prettyPrint(response.body, response.contentType));

    if (response.status >= 400) {
      logger.error(`HTTP ${response.status}`);
      process.exit(1);
    }
  },
});

interface BuildOptions {
  paramSpec: string | undefined;
  headerSpec: string | undefined;
  bodySpec: string | undefined;
}

async function buildRequest(
  oas: Oas,
  operation: Operation,
  config: ContextConfig,
  options: BuildOptions,
) {
  const paramValues = parseKeyValues(options.paramSpec);
  const extraHeaders = parseKeyValues(options.headerSpec);

  const query = new URLSearchParams();
  const headers: Record<string, string> = { Accept: "application/json" };
  const cookies: string[] = [];
  let pathTemplate = operation.getPath();

  for (const param of operation.getParameters()) {
    const raw = paramValues[param.name];
    if (raw === undefined) {
      if (param.required) {
        throw new MihariError(
          `Missing required ${param.in} parameter "${param.name}". Pass --param ${param.name}=<value>.`,
          "PARAM_REQUIRED",
        );
      }
      continue;
    }
    if (param.in === "path") {
      pathTemplate = pathTemplate.replace(`{${param.name}}`, encodeURIComponent(raw));
    } else if (param.in === "query") {
      query.set(param.name, raw);
    } else if (param.in === "header") {
      headers[param.name] = raw;
    } else if (param.in === "cookie") {
      cookies.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(raw)}`);
    }
  }

  for (const [name, value] of Object.entries(extraHeaders)) headers[name] = value;
  if (cookies.length) headers.Cookie = (headers.Cookie ? `${headers.Cookie}; ` : "") + cookies.join("; ");

  let body: string | undefined;
  if (options.bodySpec !== undefined) {
    body = options.bodySpec.startsWith("@")
      ? await readFile(options.bodySpec.slice(1), "utf8")
      : options.bodySpec;
    headers["Content-Type"] = operation.getContentType();
  } else if (operation.hasRequiredRequestBody()) {
    throw new MihariError(
      `Operation "${operation.getOperationId()}" requires a request body. Pass --body '<json>' or --body @file.json.`,
      "BODY_REQUIRED",
    );
  }

  applyAuth(config.auth as AuthConfig | undefined, headers, query);

  const serverUrl = resolveServer(oas, config);
  const qs = query.toString();
  const url = `${serverUrl.replace(/\/$/, "")}${pathTemplate}${qs ? `?${qs}` : ""}`;

  return {
    method: operation.getMethod().toUpperCase(),
    url,
    headers,
    ...(body !== undefined ? { body } : {}),
  };
}

function resolveServer(oas: Oas, config: ContextConfig): string {
  if (config.server) return config.server;
  const index = config.serverIndex ?? 0;
  return oas.url(index);
}

function parseKeyValues(spec: string | undefined): Record<string, string> {
  if (!spec) return {};
  const out: Record<string, string> = {};
  for (const entry of spec.split(",")) {
    const eq = entry.indexOf("=");
    if (eq === -1) continue;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1);
    if (key) out[key] = value;
  }
  return out;
}

function prettyPrint(body: string, contentType: string): string {
  if (!body) return "";
  if (/json/i.test(contentType)) {
    try {
      const parsed = JSON.parse(body);
      return `${JSON.stringify(parsed, null, 2)}\n`;
    } catch {
      // fall through
    }
  }
  return body.endsWith("\n") ? body : `${body}\n`;
}
