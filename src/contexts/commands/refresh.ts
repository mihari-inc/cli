import { defineCommand } from "citty";

import { loadGlobalConfig } from "../../shared/context/config.ts";
import { refreshContextSpec } from "../../shared/context/store.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

export const refreshCommand = defineCommand({
  meta: {
    name: "refresh",
    description: "Re-fetch and re-cache the OpenAPI spec for a context",
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
    if (!name) throw new MihariError("No context selected");
    const ctx = global.contexts[name];
    if (!ctx) throw new MihariError(`Unknown context "${name}"`, "CONTEXT_NOT_FOUND");
    const oas = await refreshContextSpec(name, ctx);
    logger.success(`Refreshed "${name}" — ${oas.getPaths().length} operations cached`);
  },
});
