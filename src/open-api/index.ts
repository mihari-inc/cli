import { defineCommand } from "citty";
import { bundleCommand } from "./commands/bundle.ts";
import { diffCommand } from "./commands/diff.ts";
import { lintCommand } from "./commands/lint.ts";
import { validateCommand } from "./commands/validate.ts";

export const openApi = defineCommand({
  meta: {
    name: "open-api",
    description: "Validate, lint, bundle and diff OpenAPI documents (powered by @mihari/oas)",
  },
  subCommands: {
    validate: validateCommand,
    lint: lintCommand,
    bundle: bundleCommand,
    diff: diffCommand,
  },
});
