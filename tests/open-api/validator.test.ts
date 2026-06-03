import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runChecks } from "../../src/open-api/core/validator.ts";

const fixtures = join(import.meta.dir, "fixtures");

describe("runChecks", () => {
  it("returns no errors on a valid OpenAPI 3.0 document", async () => {
    const summary = await runChecks({ files: [join(fixtures, "valid.yaml")] });
    expect(summary.totalErrors).toBe(0);
    const fileResult = summary.files[0];
    expect(fileResult).toBeDefined();
    expect(fileResult?.errorCount).toBe(0);
    expect(fileResult?.version).toBe("3.0");
  });

  it("reports structural errors on an invalid document", async () => {
    const summary = await runChecks({ files: [join(fixtures, "invalid.yaml")] });
    expect(summary.totalErrors).toBeGreaterThan(0);
    const requiredIssue = summary.files[0]?.issues.find(
      (i) => i.keyword === "required" && i.pointer === "#/info",
    );
    expect(requiredIssue).toBeDefined();
    expect(requiredIssue?.message).toContain("version");
  });

  it("throws when the file does not exist", async () => {
    await expect(runChecks({ files: ["/does/not/exist.yaml"] })).rejects.toThrow(
      /not found/i,
    );
  });

  it("throws when no files are provided", async () => {
    await expect(runChecks({ files: [] })).rejects.toThrow(/no openapi file/i);
  });

  it("validates an OpenAPI 3.1 document", async () => {
    const summary = await runChecks({ files: [join(fixtures, "valid-3.1.yaml")] });
    expect(summary.totalErrors).toBe(0);
    expect(summary.files[0]?.version).toBe("3.1");
  });
});
