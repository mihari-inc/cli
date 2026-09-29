import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { diffFiles } from "@mihari/oas";

const fixtures = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "openapi",
  "tests",
  "fixtures",
  "diff",
);

describe("CLI diff domain (via @mihari/oas)", () => {
  it("classifies the sample fixture changes", async () => {
    const result = await diffFiles(
      join(fixtures, "old.yaml"),
      join(fixtures, "new.yaml"),
    );
    expect(result.breakingCount).toBeGreaterThan(0);
    expect(result.nonBreakingCount).toBeGreaterThan(0);
  });
});
