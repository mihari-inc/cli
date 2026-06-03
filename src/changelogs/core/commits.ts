import type { RawCommit } from "../../shared/core/git.ts";

export interface ParsedCommit {
  raw: RawCommit;
  type: string | null;
  scope: string | null;
  subject: string;
  body: string | null;
  breaking: boolean;
  breakingNote: string | null;
  references: string[];
}

const HEADER_RE = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<subject>.+)$/;
const BREAKING_FOOTER_RE = /^BREAKING[- ]CHANGE:\s*(.+)$/m;
const REFERENCE_RE = /#(\d+)/g;

export function parseCommit(commit: RawCommit): ParsedCommit {
  const match = commit.subject.match(HEADER_RE);
  const groups = match?.groups;

  const breakingFooterMatch = commit.body.match(BREAKING_FOOTER_RE);
  const breaking = Boolean(groups?.bang) || Boolean(breakingFooterMatch);

  const references = Array.from(
    new Set(
      [...commit.subject.matchAll(REFERENCE_RE), ...commit.body.matchAll(REFERENCE_RE)].map(
        (m) => `#${m[1]}`,
      ),
    ),
  );

  return {
    raw: commit,
    type: groups?.type ?? null,
    scope: groups?.scope ?? null,
    subject: groups?.subject ?? commit.subject,
    body: commit.body || null,
    breaking,
    breakingNote: breakingFooterMatch?.[1]?.trim() ?? null,
    references,
  };
}

export function parseCommits(commits: RawCommit[]): ParsedCommit[] {
  return commits.map(parseCommit);
}
