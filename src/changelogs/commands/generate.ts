import { defineCommand } from "citty";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { latestTag, listCommits, remoteUrl } from "../../shared/core/git.ts";
import { loadMihariConfig } from "../../shared/core/config.ts";
import { logger } from "../../shared/utils/logger.ts";
import { parseCommits } from "../core/commits.ts";
import { generateChangelog, prependToChangelog } from "../core/generator.ts";

export const generateCommand = defineCommand({
  meta: {
    name: "generate",
    description: "Generate a changelog section from git commits",
  },
  args: {
    from: {
      type: "string",
      description: "Git ref to start from (default: latest tag)",
    },
    to: {
      type: "string",
      description: "Git ref to stop at",
      default: "HEAD",
    },
    version: {
      type: "string",
      description: "Version label for the new section (default: Unreleased)",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output file (default: mihari.config output or CHANGELOG.md)",
    },
    stdout: {
      type: "boolean",
      description: "Print to stdout instead of writing a file",
      default: false,
    },
    append: {
      type: "boolean",
      description: "Prepend to existing CHANGELOG.md",
      default: true,
    },
  },
  async run({ args }) {
    const config = await loadMihariConfig();
    const from = args.from ?? (await latestTag());
    const commits = await listCommits(from ?? null, args.to);

    if (!commits.length) {
      logger.warn(`No commits between ${from ?? "root"} and ${args.to}`);
      return;
    }

    const parsed = parseCommits(commits);
    const repo = await remoteUrl();
    const version = args.version ?? "Unreleased";

    const section = generateChangelog({
      version,
      commits: parsed,
      repositoryUrl: repo,
      previousVersion: from,
    });

    if (args.stdout) {
      process.stdout.write(section);
      return;
    }

    const outputPath = resolve(args.output ?? config.changelogs?.output ?? "CHANGELOG.md");
    const existing = existsSync(outputPath) && args.append ? await readFile(outputPath, "utf8") : "";
    const next = args.append
      ? prependToChangelog(existing, section)
      : `# Changelog\n\n${section}`;

    await writeFile(outputPath, next, "utf8");
    logger.success(`Wrote ${parsed.length} entries to ${outputPath}`);
  },
});
