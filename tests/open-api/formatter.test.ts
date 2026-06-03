import { describe, expect, it } from "bun:test";

import { format, isFormatKind } from "../../src/open-api/core/formatter.ts";
import type { ValidationSummary } from "../../src/open-api/core/types.ts";

function summary(): ValidationSummary {
  return {
    files: [
      {
        file: "/tmp/spec.yaml",
        version: "3.0",
        issues: [
          {
            severity: "error",
            pointer: "#/info",
            keyword: "required",
            message: 'Missing required property "version"',
          },
          {
            severity: "warn",
            pointer: "#/servers",
            keyword: "type",
            message: "Value should be array",
          },
        ],
        errorCount: 1,
        warningCount: 1,
      },
    ],
    totalErrors: 1,
    totalWarnings: 1,
  };
}

describe("isFormatKind", () => {
  it("accepts known values", () => {
    expect(isFormatKind("stylish")).toBe(true);
    expect(isFormatKind("json")).toBe(true);
    expect(isFormatKind("github")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isFormatKind("checkstyle")).toBe(false);
    expect(isFormatKind("")).toBe(false);
  });
});

describe("format", () => {
  it("serialises JSON with the full summary", () => {
    const out = format(summary(), "json");
    const parsed = JSON.parse(out);
    expect(parsed.totalErrors).toBe(1);
    expect(parsed.files[0].issues).toHaveLength(2);
    expect(parsed.files[0].version).toBe("3.0");
  });

  it("emits GitHub workflow commands referencing the pointer", () => {
    const out = format(summary(), "github");
    expect(out).toContain("::error ");
    expect(out).toContain("::warning ");
    expect(out).toContain("file=/tmp/spec.yaml");
    expect(out).toContain("title=required");
    expect(out).toContain("#/info");
  });

  it("produces a stylish report including summary totals", () => {
    const out = format(summary(), "stylish");
    expect(out).toContain('Missing required property "version"');
    expect(out).toContain("required");
    expect(out).toContain("#/info");
    expect(out).toContain("1 error");
    expect(out).toContain("1 warning");
  });

  it("shows a success marker when there are no issues", () => {
    const empty: ValidationSummary = {
      files: [
        { file: "/tmp/clean.yaml", version: "3.0", issues: [], errorCount: 0, warningCount: 0 },
      ],
      totalErrors: 0,
      totalWarnings: 0,
    };
    const out = format(empty, "stylish");
    expect(out).toContain("no issues");
    expect(out).toContain("No issues found");
  });
});
