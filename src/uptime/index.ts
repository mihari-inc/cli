import { defineCommand } from "citty";
import { heartbeatCommand } from "./commands/heartbeat.ts";
import { monitorCommand } from "./commands/monitor.ts";
import { statusPageCommand } from "./commands/status-page.ts";

export const uptime = defineCommand({
  meta: {
    name: "uptime",
    description: "Interact with Mihari uptime monitors, heartbeats and status pages (stubs)",
  },
  subCommands: {
    monitor: monitorCommand,
    heartbeat: heartbeatCommand,
    "status-page": statusPageCommand,
  },
});
