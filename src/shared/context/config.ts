import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | {
      type: "apiKey";
      name: string;
      in: "header" | "query" | "cookie";
      value: string;
    }
  | { type: "basic"; username: string; password: string };

export interface ContextConfig {
  /** Absolute path or https URL to the OpenAPI document. */
  spec: string;
  /** Optional server URL override — otherwise the first server in the spec is used. */
  server?: string;
  /** Optional server index override (ignored when `server` is set). */
  serverIndex?: number;
  /** Static authentication block. Credentials are written to disk in plain JSON. */
  auth?: AuthConfig;
}

export interface MihariGlobalConfig {
  currentContext?: string;
  contexts: Record<string, ContextConfig>;
}

export function configDir(): string {
  return process.env.MIHARI_HOME ?? join(homedir(), ".mihari");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function specsDir(): string {
  return join(configDir(), "specs");
}

export function contextSpecCachePath(name: string): string {
  return join(specsDir(), `${name}.json`);
}

export async function loadGlobalConfig(): Promise<MihariGlobalConfig> {
  const path = configPath();
  if (!existsSync(path)) return { contexts: {} };
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "contexts" in parsed) {
      return parsed as MihariGlobalConfig;
    }
  } catch {
    // fall through — treat any parse error as "no config yet"
  }
  return { contexts: {} };
}

export async function saveGlobalConfig(config: MihariGlobalConfig): Promise<void> {
  const dir = configDir();
  const path = configPath();
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  // Credentials may live here — restrict read/write to the owner.
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows / non-POSIX — silent fallback
  }
}

export async function getCurrentContext(): Promise<
  { name: string; config: ContextConfig } | null
> {
  const global = await loadGlobalConfig();
  const name = global.currentContext;
  if (!name) return null;
  const config = global.contexts[name];
  return config ? { name, config } : null;
}
