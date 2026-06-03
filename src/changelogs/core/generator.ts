import type { ParsedCommit } from "./commits.ts";

interface Group {
  title: string;
  types: string[];
}

const GROUPS: Group[] = [
  { title: "Features", types: ["feat"] },
  { title: "Bug Fixes", types: ["fix"] },
  { title: "Performance Improvements", types: ["perf"] },
  { title: "Reverts", types: ["revert"] },
  { title: "Documentation", types: ["docs"] },
  { title: "Code Refactoring", types: ["refactor"] },
  { title: "Tests", types: ["test"] },
  { title: "Build System", types: ["build", "ci"] },
  { title: "Chores", types: ["chore"] },
];

export interface GenerateOptions {
  version: string;
  date?: string;
  commits: ParsedCommit[];
  repositoryUrl?: string | null;
  previousVersion?: string | null;
}

function toHttpRepo(repo: string): string {
  return repo.replace(/\.git$/, "").replace(/^git@([^:]+):/, "https://$1/");
}

function commitLink(repo: string | null | undefined, hash: string, shortHash: string): string {
  if (!repo) return `(${shortHash})`;
  return `([${shortHash}](${toHttpRepo(repo)}/commit/${hash}))`;
}

function formatEntry(commit: ParsedCommit, repo: string | null | undefined): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const link = commitLink(repo, commit.raw.hash, commit.raw.shortHash);
  const refs = commit.references.length ? ` ${commit.references.join(", ")}` : "";
  return `- ${scope}${commit.subject} ${link}${refs}`;
}

export function generateChangelog(options: GenerateOptions): string {
  const { version, commits, repositoryUrl, previousVersion } = options;
  const date = options.date ?? new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  const header =
    repositoryUrl && previousVersion
      ? `## [${version}](${toHttpRepo(repositoryUrl)}/compare/${previousVersion}...${version}) (${date})`
      : `## ${version} (${date})`;
  lines.push(header, "");

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    lines.push("### BREAKING CHANGES", "");
    for (const c of breaking) {
      const scope = c.scope ? `**${c.scope}:** ` : "";
      lines.push(`- ${scope}${c.breakingNote ?? c.subject}`);
    }
    lines.push("");
  }

  for (const group of GROUPS) {
    const items = commits.filter((c) => c.type !== null && group.types.includes(c.type));
    if (!items.length) continue;
    lines.push(`### ${group.title}`, "");
    for (const item of items) lines.push(formatEntry(item, repositoryUrl));
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function prependToChangelog(existing: string, newSection: string): string {
  const header = "# Changelog\n\n";
  const trimmed = existing.trim();
  if (trimmed.startsWith("# Changelog")) {
    const rest = trimmed.slice(trimmed.indexOf("\n") + 1).trimStart();
    return `${header}${newSection}\n${rest}${rest ? "\n" : ""}`;
  }
  return `${header}${newSection}${trimmed ? `\n${trimmed}\n` : ""}`;
}
