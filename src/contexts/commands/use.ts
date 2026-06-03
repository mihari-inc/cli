import { defineCommand } from "citty";

import { loadGlobalConfig, saveGlobalConfig } from "../../shared/context/config.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

export const useCommand = defineCommand({
  meta: {
    name: "use",
    description: "Set the current context",
  },
  args: {
    name: { type: "positional", required: true, description: "Context name" },
  },
  async run({ args }) {
    const global = await loadGlobalConfig();
    if (!global.contexts[args.name]) {
      throw new MihariError(
        `Unknown context "${args.name}". Run \`mihari context list\` to see registered ones.`,
        "CONTEXT_NOT_FOUND",
      );
    }
    global.currentContext = args.name;
    await saveGlobalConfig(global);
    logger.success(`Current context → ${args.name}`);
  },
});
