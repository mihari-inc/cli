import { defineCommand } from "citty";
import { notYetWired } from "../../shared/utils/stub.ts";

export const heartbeatCommand = defineCommand({
  meta: {
    name: "heartbeat",
    description: "Send heartbeats or query recent ones (stub)",
  },
  subCommands: {
    send: defineCommand({
      meta: { name: "send", description: "Send a heartbeat for a monitor" },
      args: {
        monitor: { type: "positional", required: true, description: "Monitor ID" },
      },
      run() {
        notYetWired("POST /v1/uptime/heartbeats", "Record a heartbeat ping");
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List recent heartbeats" },
      run() {
        notYetWired("GET /v1/uptime/heartbeats", "List recent heartbeats");
      },
    }),
  },
});
