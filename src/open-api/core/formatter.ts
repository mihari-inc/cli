import { relative } from "node:path";
import pc from "picocolors";

import type { Issue, ValidationSummary } from "./types.ts";

export type FormatKind = "stylish" | "json" | "github";

export function isFormatKind(value: string): value is FormatKind {
  return value === "stylish" || value === "json" || value === "github";
}

export function format(summary: ValidationSummary, kind: FormatKind): string {
  switch (kind) {
    case "json":
      return formatJson(summary);
    case "github":
      return formatGithub(summary);
    case "stylish":
      return formatStylish(summary);
  }
}

function formatJson(summary: ValidationSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function formatGithub(summary: ValidationSummary): string {
  const lines: string[] = [];
  for (const file of summary.files) {
    for (const issue of file.issues) {
      const cmd = issue.severity === "error" ? "error" : "warning";
      const params = [`file=${file.file}`, `title=${issue.keyword}`].join(",");
      lines.push(`::${cmd} ${params}::${issue.pointer}  ${issue.message}`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function formatStylish(summary: ValidationSummary): string {
  const cwd = process.cwd();
  const lines: string[] = [];

  for (const file of summary.files) {
    const header = relative(cwd, file.file) || file.file;
    lines.push(pc.underline(header));
    if (!file.issues.length) {
      lines.push(`  ${pc.green("no issues")}`);
    } else {
      for (const issue of file.issues) lines.push(formatIssueLine(issue));
    }
    lines.push("");
  }

  lines.push(summaryLine(summary));
  return `${lines.join("\n")}\n`;
}

function formatIssueLine(issue: Issue): string {
  const tag =
    issue.severity === "error"
      ? pc.red("error  ")
      : pc.yellow("warning");
  const pointer = pc.gray(issue.pointer.padEnd(24));
  const keyword = pc.gray(issue.keyword);
  return `  ${tag}  ${pointer}  ${issue.message}  ${keyword}`;
}

function summaryLine(summary: ValidationSummary): string {
  const { totalErrors, totalWarnings } = summary;
  if (totalErrors === 0 && totalWarnings === 0) {
    return pc.green("No issues found");
  }
  const parts: string[] = [];
  if (totalErrors > 0) parts.push(pc.red(`${totalErrors} error${totalErrors === 1 ? "" : "s"}`));
  if (totalWarnings > 0)
    parts.push(pc.yellow(`${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`));
  return parts.join(", ");
}
