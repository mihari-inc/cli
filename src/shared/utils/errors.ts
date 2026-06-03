export class MihariError extends Error {
  public readonly code: string;
  public override readonly cause?: unknown;

  constructor(message: string, code = "MIHARI_ERROR", cause?: unknown) {
    super(message);
    this.name = "MihariError";
    this.code = code;
    this.cause = cause;
  }
}

export class GitError extends MihariError {
  constructor(message: string, cause?: unknown) {
    super(message, "GIT_ERROR", cause);
    this.name = "GitError";
  }
}

export class ChangelogError extends MihariError {
  constructor(message: string, cause?: unknown) {
    super(message, "CHANGELOG_ERROR", cause);
    this.name = "ChangelogError";
  }
}
