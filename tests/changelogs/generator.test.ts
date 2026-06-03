import { describe, expect, it } from "bun:test";
import { generateChangelog, prependToChangelog } from "../../src/changelogs/core/generator.ts";
import { parseCommit } from "../../src/changelogs/core/commits.ts";
import type { RawCommit } from "../../src/shared/core/git.ts";

function raw(subject: string, body = "", shortHash = "abc1234"): RawCommit {
  return {
    hash: `${shortHash}000000000000000000000000000000000000`.slice(0, 40),
    shortHash,
    author: "Dev",
    email: "dev@example.com",
    date: "2026-04-22T10:00:00+02:00",
    subject,
    body,
  };
}

describe("generateChangelog", () => {
  it("groups commits by type", () => {
    const out = generateChangelog({
      version: "v1.0.0",
      date: "2026-04-22",
      commits: [
        parseCommit(raw("feat(uptime): add heartbeat", "", "11111aa")),
        parseCommit(raw("fix: null pointer on boot", "", "22222bb")),
        parseCommit(raw("chore: bump deps", "", "33333cc")),
      ],
    });
    expect(out).toContain("## v1.0.0 (2026-04-22)");
    expect(out).toContain("### Features");
    expect(out).toContain("**uptime:** add heartbeat");
    expect(out).toContain("### Bug Fixes");
    expect(out).toContain("### Chores");
  });

  it("renders a BREAKING CHANGES section", () => {
    const out = generateChangelog({
      version: "v2.0.0",
      date: "2026-04-22",
      commits: [parseCommit(raw("feat!: drop node 18 support"))],
    });
    expect(out).toContain("### BREAKING CHANGES");
    expect(out).toContain("drop node 18 support");
  });

  it("omits empty groups", () => {
    const out = generateChangelog({
      version: "v1.0.1",
      date: "2026-04-22",
      commits: [parseCommit(raw("fix: typo"))],
    });
    expect(out).not.toContain("### Features");
    expect(out).toContain("### Bug Fixes");
  });

  it("links to compare URL when repo + previous tag are known", () => {
    const out = generateChangelog({
      version: "v1.1.0",
      date: "2026-04-22",
      commits: [parseCommit(raw("feat: new"))],
      repositoryUrl: "git@github.com:mihari/cli.git",
      previousVersion: "v1.0.0",
    });
    expect(out).toContain("[v1.1.0](https://github.com/mihari/cli/compare/v1.0.0...v1.1.0)");
  });
});

describe("prependToChangelog", () => {
  it("adds a header when file is empty", () => {
    const out = prependToChangelog("", "## v1.0.0 (2026-04-22)\n\n### Features\n- x\n");
    expect(out.startsWith("# Changelog\n\n## v1.0.0")).toBe(true);
  });

  it("prepends new section above existing entries", () => {
    const existing = "# Changelog\n\n## v0.9.0 (2026-03-01)\n\n### Features\n- old\n";
    const out = prependToChangelog(existing, "## v1.0.0 (2026-04-22)\n\n### Features\n- new\n");
    const v1Index = out.indexOf("## v1.0.0");
    const v09Index = out.indexOf("## v0.9.0");
    expect(v1Index).toBeGreaterThan(-1);
    expect(v09Index).toBeGreaterThan(v1Index);
  });
});
