import { defineCommand } from "citty";
import { addCommand } from "./commands/add.ts";
import { listCommand } from "./commands/list.ts";
import { refreshCommand } from "./commands/refresh.ts";
import { removeCommand } from "./commands/remove.ts";
import { showCommand } from "./commands/show.ts";
import { useCommand } from "./commands/use.ts";

export const contexts = defineCommand({
  meta: {
    name: "context",
    description: "Manage Mihari CLI contexts (OpenAPI specs + auth) stored in ~/.mihari/",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    use: useCommand,
    remove: removeCommand,
    show: showCommand,
    refresh: refreshCommand,
  },
});
