import { describe, expect, it } from "bun:test";
import { parseCommit } from "../../src/changelogs/core/commits.ts";
import type { RawCommit } from "../../src/shared/core/git.ts";

function raw(subject: string, body = ""): RawCommit {
  return {
    hash: "abcdef0123456789abcdef0123456789abcdef01",
    shortHash: "abcdef0",
    author: "Dev",
    email: "dev@example.com",
    date: "2026-04-22T10:00:00+02:00",
    subject,
    body,
  };
}

describe("parseCommit", () => {
  it("parses a feat with scope", () => {
    const c = parseCommit(raw("feat(uptime): add monitor endpoint"));
    expect(c.type).toBe("feat");
    expect(c.scope).toBe("uptime");
    expect(c.subject).toBe("add monitor endpoint");
    expect(c.breaking).toBe(false);
  });

  it("detects bang breaking change", () => {
    const c = parseCommit(raw("feat!: drop node 18"));
    expect(c.breaking).toBe(true);
  });

  it("detects BREAKING CHANGE footer", () => {
    const c = parseCommit(raw("refactor: rename field", "BREAKING CHANGE: `id` is now `uuid`"));
    expect(c.breaking).toBe(true);
    expect(c.breakingNote).toBe("`id` is now `uuid`");
  });

  it("extracts issue references", () => {
    const c = parseCommit(raw("fix(auth): handle expired token #42", "closes #43"));
    expect(c.references).toEqual(["#42", "#43"]);
  });

  it("falls back to raw subject for non-conventional commits", () => {
    const c = parseCommit(raw("Update README"));
    expect(c.type).toBeNull();
    expect(c.subject).toBe("Update README");
  });
});
