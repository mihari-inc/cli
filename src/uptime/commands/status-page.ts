import { defineCommand } from "citty";
import { notYetWired } from "../../shared/utils/stub.ts";

export const statusPageCommand = defineCommand({
  meta: {
    name: "status-page",
    description: "Manage public status pages (stub)",
  },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "List status pages" },
      run() {
        notYetWired("GET /v1/uptime/status-pages", "List all status pages");
      },
    }),
  },
});
