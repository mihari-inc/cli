import { defineCommand } from "citty";
import { sourcesCommand } from "./commands/sources.ts";

export const telemetry = defineCommand({
  meta: {
    name: "telemetry",
    description: "Interact with Mihari telemetry sources and events (stubs)",
  },
  subCommands: {
    sources: sourcesCommand,
  },
});
