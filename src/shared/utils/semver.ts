import semver from "semver";

export type BumpType = "major" | "minor" | "patch" | "auto";

export function isValidBumpType(value: string): value is BumpType {
  return value === "major" || value === "minor" || value === "patch" || value === "auto";
}

export interface BumpContext {
  hasBreaking: boolean;
  hasFeat: boolean;
}

export function bumpVersion(current: string, type: BumpType, ctx: BumpContext): string {
  const normalized = current.replace(/^v/, "");
  if (!semver.valid(normalized)) {
    throw new Error(`Invalid version "${current}" (normalized: "${normalized}")`);
  }

  const actual: semver.ReleaseType =
    type === "auto"
      ? ctx.hasBreaking
        ? "major"
        : ctx.hasFeat
          ? "minor"
          : "patch"
      : type;

  const next = semver.inc(normalized, actual);
  if (!next) {
    throw new Error(`Failed to bump ${normalized} as ${actual}`);
  }
  return next;
}
