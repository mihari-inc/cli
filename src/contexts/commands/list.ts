import { defineCommand } from "citty";
import pc from "picocolors";

import { loadGlobalConfig } from "../../shared/context/config.ts";
import { logger } from "../../shared/utils/logger.ts";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List registered contexts",
  },
  async run() {
    const global = await loadGlobalConfig();
    const entries = Object.entries(global.contexts);
    if (!entries.length) {
      logger.info("No contexts registered. Use `mihari context add <name> --spec <path-or-url>`.");
      return;
    }
    for (const [name, ctx] of entries) {
      const marker = name === global.currentContext ? pc.green("*") : " ";
      const authLabel = ctx.auth ? ctx.auth.type : "none";
      process.stdout.write(
        `${marker} ${pc.bold(name.padEnd(20))}  ${ctx.spec}  ${pc.gray(`auth=${authLabel}`)}\n`,
      );
    }
  },
});
