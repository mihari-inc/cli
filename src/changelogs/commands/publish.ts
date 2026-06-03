import { defineCommand } from "citty";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadMihariConfig, type PublishTarget } from "../../shared/core/config.ts";
import { remoteUrl } from "../../shared/core/git.ts";
import { ChangelogError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import { publishChangelog } from "../core/publisher.ts";

const VALID_TARGETS: ReadonlySet<PublishTarget> = new Set<PublishTarget>(["api", "webhook", "discord"]);

function isTarget(v: string | undefined): v is PublishTarget {
  return typeof v === "string" && VALID_TARGETS.has(v as PublishTarget);
}

export const publishCommand = defineCommand({
  meta: {
    name: "publish",
    description: "Publish a changelog section to the Mihari API, a webhook or Discord",
  },
  args: {
    target: {
      type: "string",
      description: "api | webhook | discord",
    },
    url: {
      type: "string",
      description: "Destination URL (overrides mihari.config)",
    },
    token: {
      type: "string",
      description: "Bearer token (for target=api)",
    },
    version: {
      type: "string",
      required: true,
      description: "Version being published (e.g. v1.2.0)",
    },
    input: {
      type: "string",
      alias: "i",
      description: "Markdown file to read the section from (default: CHANGELOG.md)",
    },
  },
  async run({ args }) {
    const config = await loadMihariConfig();

    const targetRaw = args.target ?? config.changelogs?.publish?.target;
    if (!isTarget(targetRaw)) {
      throw new ChangelogError("Missing or invalid --target (expected: api | webhook | discord)");
    }
    const target: PublishTarget = targetRaw;

    const url = args.url ?? config.changelogs?.publish?.url ?? process.env.MIHARI_API_URL;
    if (!url) {
      throw new ChangelogError(
        "Missing destination URL. Provide --url, set changelogs.publish.url in mihari.config, or MIHARI_API_URL.",
      );
    }
    const token =
      args.token ?? config.changelogs?.publish?.token ?? process.env.MIHARI_API_TOKEN;

    const path = resolve(args.input ?? config.changelogs?.output ?? "CHANGELOG.md");
    const content = await readFile(path, "utf8");
    const section = extractSection(content, args.version);
    if (!section) {
      throw new ChangelogError(`Could not find a section for "${args.version}" in ${path}`);
    }

    const repo = await remoteUrl();

    await publishChangelog({
      target,
      url,
      ...(token !== undefined ? { token } : {}),
      payload: {
        version: args.version,
        previousVersion: null,
        date: new Date().toISOString().slice(0, 10),
        markdown: section,
        repository: repo,
        commitCount: (section.match(/^- /gm) ?? []).length,
      },
    });

    logger.success(`Published ${args.version} → ${target}`);
  },
});

function extractSection(markdown: string, version: string): string | null {
  const escaped = version.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  // Matches the "## <version>" (optionally wrapped in []) and everything until the next "## " or EOF.
  const re = new RegExp(
    `^##\\s+(?:\\[)?${escaped}(?:\\])?[^\\n]*\\n([\\s\\S]*?)(?=\\n## |\\n?$)`,
    "m",
  );
  const match = markdown.match(re);
  return match?.[0]?.trim() ?? null;
}
