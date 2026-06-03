import { defineCommand } from "citty";
import { relative } from "node:path";
import pc from "picocolors";

import {
  diffFiles,
  type ChangeSeverity,
  type DiffChange,
  type DiffFilesResult,
} from "@mihari/oas";

import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

type Format = "stylish" | "json" | "github";
const FORMATS: readonly Format[] = ["stylish", "json", "github"];

function isFormat(v: string): v is Format {
  return (FORMATS as readonly string[]).includes(v);
}

export const diffCommand = defineCommand({
  meta: {
    name: "diff",
    description: "Compare two OpenAPI files and classify changes as breaking / non-breaking / info",
  },
  args: {
    old: {
      type: "positional",
      required: true,
      description: "Previous OpenAPI file",
    },
    new: {
      type: "positional",
      required: true,
      description: "Updated OpenAPI file",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: stylish | json | github",
      default: "stylish",
    },
    "fail-on-breaking": {
      type: "boolean",
      description: "Exit with code 1 if at least one breaking change is detected",
      default: true,
    },
    "ignore-metadata": {
      type: "boolean",
      description: "Ignore summary/description-only changes",
      default: false,
    },
  },
  async run({ args }) {
    if (!isFormat(args.format)) {
      throw new MihariError(
        `Invalid --format "${args.format}". Expected: stylish | json | github`,
      );
    }
    const fmt: Format = args.format;

    const result = await diffFiles(args.old, args.new, {
      ignoreMetadata: args["ignore-metadata"],
    });

    if (result.issues.some((i) => i.severity === "error")) {
      for (const issue of result.issues) {
        if (issue.severity === "error") {
          logger.error(`${issue.pointer}  ${issue.keyword}  ${issue.message}`);
        }
      }
      process.exit(1);
    }

    process.stdout.write(format(result, fmt, args.old, args.new));

    if (args["fail-on-breaking"] && result.breakingCount > 0) {
      process.exit(1);
    }
  },
});

function format(
  result: DiffFilesResult,
  kind: Format,
  oldPath: string,
  newPath: string,
): string {
  if (kind === "json") return `${JSON.stringify(result, null, 2)}\n`;
  if (kind === "github") return formatGithub(result);
  return formatStylish(result, oldPath, newPath);
}

function formatGithub(result: DiffFilesResult): string {
  const lines: string[] = [];
  for (const change of result.changes) {
    const cmd = change.severity === "breaking" ? "error" : "notice";
    const params = [`title=${change.category}/${change.action}`].join(",");
    lines.push(`::${cmd} ${params}::${change.pointer}  ${change.message}`);
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function formatStylish(result: DiffFilesResult, oldPath: string, newPath: string): string {
  const cwd = process.cwd();
  const oldRel = relative(cwd, oldPath) || oldPath;
  const newRel = relative(cwd, newPath) || newPath;

  const lines: string[] = [pc.gray(`${oldRel} → ${newRel}`), ""];
  const sections: Array<[ChangeSeverity, string, (s: string) => string]> = [
    ["breaking", "Breaking", pc.red],
    ["non-breaking", "Non-breaking", pc.cyan],
    ["info", "Info", pc.gray],
  ];

  for (const [sev, title, color] of sections) {
    const items = result.changes.filter((c) => c.severity === sev);
    if (!items.length) continue;
    lines.push(color(title));
    for (const change of items) lines.push(formatChange(change, color));
    lines.push("");
  }

  lines.push(summary(result));
  return `${lines.join("\n")}\n`;
}

function formatChange(change: DiffChange, color: (s: string) => string): string {
  const tag = `[${change.category}/${change.action}]`.padEnd(26);
  return `  ${color(tag)}  ${change.message}  ${pc.gray(change.pointer)}`;
}

function summary(result: DiffFilesResult): string {
  if (result.breakingCount === 0 && result.nonBreakingCount === 0 && result.infoCount === 0) {
    return pc.green("No changes");
  }
  const parts: string[] = [];
  if (result.breakingCount > 0)
    parts.push(pc.red(`${result.breakingCount} breaking`));
  if (result.nonBreakingCount > 0)
    parts.push(pc.cyan(`${result.nonBreakingCount} non-breaking`));
  if (result.infoCount > 0) parts.push(pc.gray(`${result.infoCount} info`));
  return parts.join(", ");
}
