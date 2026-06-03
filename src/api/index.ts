import { defineCommand } from "citty";
import { callCommand } from "./commands/call.ts";
import { generateCommand } from "./commands/generate.ts";
import { listCommand } from "./commands/list.ts";
import { showCommand } from "./commands/show.ts";

export const api = defineCommand({
  meta: {
    name: "api",
    description: "Explore, execute and generate code from the current context's OpenAPI spec",
  },
  subCommands: {
    list: listCommand,
    show: showCommand,
    call: callCommand,
    generate: generateCommand,
  },
});
