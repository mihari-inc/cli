import { defineCommand } from "citty";

import { loadGlobalConfig } from "../../shared/context/config.ts";
import { MihariError } from "../../shared/utils/errors.ts";

export const showCommand = defineCommand({
  meta: {
    name: "show",
    description: "Print the configuration for a context (auth is redacted)",
  },
  args: {
    name: {
      type: "positional",
      required: false,
      description: "Context name (default: current)",
    },
  },
  async run({ args }) {
    const global = await loadGlobalConfig();
    const name = args.name ?? global.currentContext;
    if (!name) {
      throw new MihariError("No context selected. Pass a name or run `mihari context use <name>`.");
    }
    const ctx = global.contexts[name];
    if (!ctx) throw new MihariError(`Unknown context "${name}"`, "CONTEXT_NOT_FOUND");
    const redacted = {
      ...ctx,
      ...(ctx.auth ? { auth: redactAuth(ctx.auth) } : {}),
    };
    process.stdout.write(`${JSON.stringify({ name, current: name === global.currentContext, ...redacted }, null, 2)}\n`);
  },
});

function redactAuth(auth: NonNullable<import("../../shared/context/config.ts").AuthConfig>) {
  if (auth.type === "bearer") return { type: "bearer", token: mask(auth.token) };
  if (auth.type === "basic") return { type: "basic", username: auth.username, password: mask(auth.password) };
  if (auth.type === "apiKey") {
    return { type: "apiKey", name: auth.name, in: auth.in, value: mask(auth.value) };
  }
  return auth;
}

function mask(value: string): string {
  if (!value) return value;
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}${"*".repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`;
}
