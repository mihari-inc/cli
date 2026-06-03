import { defineCommand } from "citty";
import pc from "picocolors";

import { getCurrentContext } from "../../shared/context/config.ts";
import { loadContextSpec } from "../../shared/context/store.ts";
import { MihariError } from "../../shared/utils/errors.ts";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List every operation available in the current context's spec",
  },
  args: {
    tag: {
      type: "string",
      alias: "t",
      description: "Only show operations carrying this tag",
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
    let ops = oas.getPaths();
    if (args.tag) {
      const tag = args.tag;
      ops = ops.filter((o) => o.getTags().includes(tag));
    }
    if (!ops.length) {
      process.stdout.write(pc.gray("(no operations)\n"));
      return;
    }
    for (const op of ops) {
      const idCell = pc.bold(op.getOperationId().padEnd(28));
      const method = op.getMethod().toUpperCase().padEnd(6);
      const summary = op.getSummary();
      process.stdout.write(
        `${idCell}  ${pc.cyan(method)}${op.getPath()}${summary ? pc.gray(`  — ${summary}`) : ""}\n`,
      );
    }
  },
});
