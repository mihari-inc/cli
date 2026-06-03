import { defineCommand } from "citty";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createTag, latestTag, listCommits, pushTag, remoteUrl } from "../../shared/core/git.ts";
import { loadMihariConfig } from "../../shared/core/config.ts";
import { ChangelogError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import { bumpVersion, isValidBumpType, type BumpType } from "../../shared/utils/semver.ts";
import { parseCommits } from "../core/commits.ts";
import { generateChangelog, prependToChangelog } from "../core/generator.ts";

export const releaseCommand = defineCommand({
  meta: {
    name: "release",
    description: "Bump version, update CHANGELOG.md and create a git tag",
  },
  args: {
    type: {
      type: "string",
      description: "major | minor | patch | auto",
      default: "auto",
    },
    dryRun: {
      type: "boolean",
      description: "Show what would be done without writing or tagging",
      default: false,
    },
    push: {
      type: "boolean",
      description: "Push the created tag to origin",
      default: false,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Changelog output file",
    },
  },
  async run({ args }) {
    if (!isValidBumpType(args.type)) {
      throw new ChangelogError(
        `Invalid --type "${args.type}". Expected: major, minor, patch, auto`,
      );
    }
    const type: BumpType = args.type;

    const config = await loadMihariConfig();
    const previousTag = await latestTag();
    const commits = await listCommits(previousTag ?? null);
    if (!commits.length) {
      logger.warn("No commits since last tag — nothing to release");
      return;
    }

    const parsed = parseCommits(commits);
    const hasBreaking = parsed.some((c) => c.breaking);
    const hasFeat = parsed.some((c) => c.type === "feat");

    const currentVersion = previousTag ?? "0.0.0";
    const next = bumpVersion(currentVersion, type, { hasBreaking, hasFeat });
    const versionTag = `v${next}`;

    const repo = await remoteUrl();
    const section = generateChangelog({
      version: versionTag,
      commits: parsed,
      repositoryUrl: repo,
      previousVersion: previousTag,
    });

    const outputPath = resolve(args.output ?? config.changelogs?.output ?? "CHANGELOG.md");

    logger.info(`current: ${previousTag ?? "(none)"} → next: ${versionTag}`);
    logger.info(`${parsed.length} commits · breaking=${hasBreaking} · feat=${hasFeat}`);

    if (args.dryRun) {
      process.stdout.write("\n--- CHANGELOG SECTION ---\n");
      process.stdout.write(section);
      process.stdout.write("--- END ---\n");
      return;
    }

    const existing = existsSync(outputPath) ? await readFile(outputPath, "utf8") : "";
    await writeFile(outputPath, prependToChangelog(existing, section), "utf8");
    logger.success(`Updated ${outputPath}`);

    await createTag(versionTag, `Release ${versionTag}`);
    logger.success(`Created tag ${versionTag}`);

    if (args.push) {
      await pushTag(versionTag);
      logger.success(`Pushed ${versionTag} to origin`);
    }
  },
});
