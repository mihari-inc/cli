import { spawn } from "node:child_process";
import { GitError } from "../utils/errors.ts";

async function git(args: string[], cwd: string = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trimEnd());
      else reject(new GitError(`git ${args.join(" ")} exited ${code}: ${stderr.trim()}`));
    });
    proc.on("error", (err) =>
      reject(new GitError(`Failed to spawn git: ${err.message}`, err)),
    );
  });
}

export interface RawCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
}

const COMMIT_SEP = "\x1e";
const FIELD_SEP = "\x1f";

export async function listCommits(
  from: string | null,
  to = "HEAD",
  cwd?: string,
): Promise<RawCommit[]> {
  const format = ["%H", "%h", "%an", "%ae", "%aI", "%s", "%b"].join(FIELD_SEP);
  const range = from ? `${from}..${to}` : to;
  const raw = await git(["log", range, `--format=${format}${COMMIT_SEP}`], cwd);
  if (!raw) return [];

  return raw
    .split(COMMIT_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", shortHash = "", author = "", email = "", date = "", subject = "", ...bodyParts] =
        entry.split(FIELD_SEP);
      return {
        hash,
        shortHash,
        author,
        email,
        date,
        subject,
        body: bodyParts.join(FIELD_SEP).trim(),
      };
    });
}

export async function latestTag(cwd?: string): Promise<string | null> {
  try {
    const tag = await git(["describe", "--tags", "--abbrev=0"], cwd);
    return tag || null;
  } catch {
    return null;
  }
}

export async function currentBranch(cwd?: string): Promise<string> {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export async function remoteUrl(cwd?: string): Promise<string | null> {
  try {
    const url = await git(["config", "--get", "remote.origin.url"], cwd);
    return url || null;
  } catch {
    return null;
  }
}

export async function createTag(tag: string, message: string, cwd?: string): Promise<void> {
  await git(["tag", "-a", tag, "-m", message], cwd);
}

export async function pushTag(tag: string, remote = "origin", cwd?: string): Promise<void> {
  await git(["push", remote, tag], cwd);
}
