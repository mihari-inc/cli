import { defineCommand } from "citty";
import { resolve } from "node:path";

import { refreshContextSpec } from "../../shared/context/store.ts";
import {
  loadGlobalConfig,
  saveGlobalConfig,
  type AuthConfig,
  type ContextConfig,
} from "../../shared/context/config.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Register a new context (name + OpenAPI spec + optional auth)",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Context name (kebab-case recommended)",
    },
    spec: {
      type: "string",
      alias: "s",
      required: true,
      description: "Path or https URL to the OpenAPI document",
    },
    server: {
      type: "string",
      description: "Override server URL (otherwise the first server from the spec is used)",
    },
    "server-index": {
      type: "string",
      description: "Pick a specific server index from the spec",
    },
    "auth-bearer": {
      type: "string",
      description: "Store a static bearer token for this context",
    },
    "auth-apikey-header": {
      type: "string",
      description: "apiKey auth via header: --auth-apikey-header X-Token=secret",
    },
    use: {
      type: "boolean",
      description: "Make this context the current one right after adding it",
      default: true,
    },
    force: {
      type: "boolean",
      description: "Overwrite an existing context with the same name",
      default: false,
    },
  },
  async run({ args }) {
    const global = await loadGlobalConfig();
    if (!args.force && global.contexts[args.name]) {
      throw new MihariError(
        `Context "${args.name}" already exists. Pass --force to overwrite.`,
        "CONTEXT_EXISTS",
      );
    }

    const spec = /^https?:\/\//.test(args.spec) ? args.spec : resolve(args.spec);
    const context: ContextConfig = { spec };
    if (args.server) context.server = args.server;
    if (args["server-index"] !== undefined) {
      const parsed = Number(args["server-index"]);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new MihariError(`--server-index must be a non-negative integer`);
      }
      context.serverIndex = parsed;
    }

    const auth = buildAuth(args);
    if (auth) context.auth = auth;

    global.contexts[args.name] = context;
    if (args.use || !global.currentContext) global.currentContext = args.name;
    await saveGlobalConfig(global);
    logger.success(`Added context "${args.name}"`);

    // Eagerly fetch + cache the spec so the first `api ...` call is instant.
    try {
      const oas = await refreshContextSpec(args.name, context);
      const opCount = oas.getPaths().length;
      logger.info(`Cached ${opCount} operations from ${context.spec}`);
    } catch (error) {
      logger.warn(
        `Context registered but spec could not be cached: ${(error as Error).message}`,
      );
    }
  },
});

function buildAuth(args: Record<string, unknown>): AuthConfig | undefined {
  const bearer = args["auth-bearer"];
  if (typeof bearer === "string" && bearer.length > 0) {
    return { type: "bearer", token: bearer };
  }
  const apiKeyHeader = args["auth-apikey-header"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.includes("=")) {
    const eq = apiKeyHeader.indexOf("=");
    const name = apiKeyHeader.slice(0, eq);
    const value = apiKeyHeader.slice(eq + 1);
    if (name.length > 0) {
      return { type: "apiKey", name, in: "header", value };
    }
  }
  return undefined;
}
