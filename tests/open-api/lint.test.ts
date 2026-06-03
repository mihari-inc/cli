import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { lintFile } from "@mihari/oas";

const fixtures = join(import.meta.dir, "fixtures");

describe("CLI lint domain (via @mihari/oas)", () => {
  it("is clean on the valid fixture", async () => {
    // The "valid" OpenAPI fixture was designed for structural validation; it
    // intentionally lacks tags/description/contact so we just confirm lint runs
    // to completion without throwing.
    const result = await lintFile(join(fixtures, "valid.yaml"));
    // No $ref errors, no crashes. There may be warnings.
    expect(result.issues.filter((i) => i.keyword.startsWith("$ref-"))).toHaveLength(0);
  });

  it("reports the expected rule ids on a messy fixture", async () => {
    const result = await lintFile(join(fixtures, "lint-messy.yaml"));
    const keywords = new Set(result.issues.map((i) => i.keyword));
    expect(keywords.has("operation-operation-id-unique")).toBe(true);
    expect(keywords.has("operation-tags")).toBe(true);
    expect(keywords.has("tag-description")).toBe(true);
  });

  it("respects severity overrides from config", async () => {
    const result = await lintFile(join(fixtures, "lint-messy.yaml"), {
      rules: {
        "operation-tags": "off",
        "tag-description": "off",
      },
    });
    const keywords = new Set(result.issues.map((i) => i.keyword));
    expect(keywords.has("operation-tags")).toBe(false);
    expect(keywords.has("tag-description")).toBe(false);
    // but the error-severity rules are still on
    expect(keywords.has("operation-operation-id-unique")).toBe(true);
  });
});
