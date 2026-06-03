import { defineCommand } from "citty";
import { notYetWired } from "../../shared/utils/stub.ts";

export const monitorCommand = defineCommand({
  meta: {
    name: "monitor",
    description: "List, inspect or mutate uptime monitors (stub)",
  },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "List monitors" },
      run() {
        notYetWired("GET /v1/uptime/monitors", "List all monitors for the current project");
      },
    }),
    get: defineCommand({
      meta: { name: "get", description: "Get a monitor by id" },
      args: {
        id: { type: "positional", required: true, description: "Monitor ID" },
      },
      run() {
        notYetWired("GET /v1/uptime/monitors/{id}", "Fetch a single monitor");
      },
    }),
  },
});
