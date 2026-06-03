import { defineCommand } from "citty";
import { generateCommand } from "./commands/generate.ts";
import { publishCommand } from "./commands/publish.ts";
import { releaseCommand } from "./commands/release.ts";

export const changelogs = defineCommand({
  meta: {
    name: "changelogs",
    description: "Generate, publish and tag releases from git history",
  },
  subCommands: {
    generate: generateCommand,
    publish: publishCommand,
    release: releaseCommand,
  },
});
