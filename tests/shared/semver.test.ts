import { describe, expect, it } from "bun:test";
import { bumpVersion, isValidBumpType } from "../../src/shared/utils/semver.ts";

describe("bumpVersion", () => {
  it("bumps patch when no feat or breaking", () => {
    expect(bumpVersion("1.2.3", "auto", { hasBreaking: false, hasFeat: false })).toBe("1.2.4");
  });

  it("bumps minor when feat but no breaking", () => {
    expect(bumpVersion("1.2.3", "auto", { hasBreaking: false, hasFeat: true })).toBe("1.3.0");
  });

  it("bumps major when breaking", () => {
    expect(bumpVersion("1.2.3", "auto", { hasBreaking: true, hasFeat: true })).toBe("2.0.0");
  });

  it("forces type when explicit", () => {
    expect(bumpVersion("1.2.3", "major", { hasBreaking: false, hasFeat: false })).toBe("2.0.0");
  });

  it("strips leading v", () => {
    expect(bumpVersion("v0.1.0", "patch", { hasBreaking: false, hasFeat: false })).toBe("0.1.1");
  });

  it("throws on invalid version", () => {
    expect(() =>
      bumpVersion("not-a-version", "auto", { hasBreaking: false, hasFeat: false }),
    ).toThrow();
  });
});

describe("isValidBumpType", () => {
  it("accepts the four valid values", () => {
    expect(isValidBumpType("major")).toBe(true);
    expect(isValidBumpType("minor")).toBe(true);
    expect(isValidBumpType("patch")).toBe(true);
    expect(isValidBumpType("auto")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidBumpType("")).toBe(false);
    expect(isValidBumpType("foo")).toBe(false);
  });
});
