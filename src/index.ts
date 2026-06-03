import { defineCommand } from "citty";
import { api } from "./api/index.ts";
import { changelogs } from "./changelogs/index.ts";
import { contexts } from "./contexts/index.ts";
import { openApi } from "./open-api/index.ts";
import { telemetry } from "./telemetry/index.ts";
import { uptime } from "./uptime/index.ts";

export const main = defineCommand({
  meta: {
    name: "mihari",
    version: "0.1.0",
    description: "Mihari CLI — interact with Mihari services from your terminal",
  },
  subCommands: {
    context: contexts,
    api,
    changelogs,
    "open-api": openApi,
    uptime,
    telemetry,
  },
});
