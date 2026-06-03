import { defineCommand } from "citty";
import { notYetWired } from "../../shared/utils/stub.ts";

export const sourcesCommand = defineCommand({
  meta: {
    name: "sources",
    description: "List or configure telemetry sources (stub)",
  },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "List telemetry sources" },
      run() {
        notYetWired("GET /v1/telemetry/sources", "List all configured telemetry sources");
      },
    }),
    sync: defineCommand({
      meta: { name: "sync", description: "Trigger a sync on a telemetry source" },
      args: {
        id: { type: "positional", required: true, description: "Source ID" },
      },
      run() {
        notYetWired("POST /v1/telemetry/sources/{id}/sync", "Trigger an immediate sync");
      },
    }),
  },
});
