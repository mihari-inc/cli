import { defineCommand } from "citty";
import pc from "picocolors";

import { getCurrentContext } from "../../shared/context/config.ts";
import { loadContextSpec } from "../../shared/context/store.ts";
import { MihariError } from "../../shared/utils/errors.ts";

export const showCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show details of an operation (parameters, body, responses, security)",
  },
  args: {
    operation: {
      type: "positional",
      required: true,
      description: "operationId, or `METHOD /path`",
    },
  },
  async run({ args }) {
    const ctx = await getCurrentContext();
    if (!ctx) throw new MihariError("No current context");
    const oas = await loadContextSpec(ctx.name, ctx.config);
    const op = oas.findOperation(args.operation);
    if (!op) {
      throw new MihariError(
        `Operation "${args.operation}" not found in context "${ctx.name}"`,
        "OPERATION_NOT_FOUND",
      );
    }

    process.stdout.write(
      `${pc.bold(op.getOperationId())}  ${pc.cyan(op.getMethod().toUpperCase())} ${op.getPath()}\n`,
    );
    const summary = op.getSummary();
    if (summary) process.stdout.write(`${pc.gray(summary)}\n`);
    const description = op.getDescription();
    if (description && description !== summary) process.stdout.write(`\n${description}\n`);

    const tags = op.getTags();
    if (tags.length) process.stdout.write(`\n${pc.gray("tags:")} ${tags.join(", ")}\n`);

    const params = op.getParameters();
    if (params.length) {
      process.stdout.write(`\n${pc.bold("Parameters")}\n`);
      for (const p of params) {
        const req = p.required ? pc.red("required") : pc.gray("optional");
        process.stdout.write(
          `  ${p.name.padEnd(20)} ${pc.cyan(p.in.padEnd(7))} ${req}${p.description ? pc.gray(`  — ${p.description}`) : ""}\n`,
        );
      }
    }

    if (op.hasRequestBody()) {
      const required = op.hasRequiredRequestBody() ? pc.red("required") : pc.gray("optional");
      process.stdout.write(
        `\n${pc.bold("Request Body")}  ${required}  (${op.getRequestBodyMediaTypes().join(", ")})\n`,
      );
    }

    const codes = op.getResponseStatusCodes();
    if (codes.length) {
      process.stdout.write(`\n${pc.bold("Responses")}\n`);
      for (const code of codes) {
        const response = op.getResponseByStatusCode(code) ?? {};
        const desc = typeof response.description === "string" ? response.description : "";
        process.stdout.write(`  ${code.padEnd(5)} ${pc.gray(desc)}\n`);
      }
    }

    const security = op.getSecurity();
    if (security.length) {
      process.stdout.write(`\n${pc.bold("Security")}\n`);
      for (const req of security) {
        for (const [scheme, scopes] of Object.entries(req)) {
          const scopeSuffix = scopes.length ? ` (${scopes.join(", ")})` : "";
          process.stdout.write(`  ${scheme}${scopeSuffix}\n`);
        }
      }
    }
  },
});
