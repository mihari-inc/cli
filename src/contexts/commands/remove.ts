import { defineCommand } from "citty";

import { loadGlobalConfig, saveGlobalConfig } from "../../shared/context/config.ts";
import { invalidateContextCache } from "../../shared/context/store.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

export const removeCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a context (and its cached spec)",
  },
  args: {
    name: { type: "positional", required: true, description: "Context name" },
  },
  async run({ args }) {
    const global = await loadGlobalConfig();
    if (!global.contexts[args.name]) {
      throw new MihariError(`Unknown context "${args.name}"`, "CONTEXT_NOT_FOUND");
    }
    delete global.contexts[args.name];
    if (global.currentContext === args.name) {
      const remaining = Object.keys(global.contexts);
      global.currentContext = remaining[0];
    }
    await saveGlobalConfig(global);
    await invalidateContextCache(args.name);
    logger.success(`Removed context "${args.name}"`);
  },
});
