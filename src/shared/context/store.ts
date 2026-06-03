import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Oas, parseContent, parseFile, resolveRefs } from "@mihari/oas";

import { MihariError } from "../utils/errors.ts";
import { contextSpecCachePath, specsDir, type ContextConfig } from "./config.ts";

export interface LoadOptions {
  /** Bypass the on-disk cache and re-fetch the spec. */
  refresh?: boolean;
}

/**
 * Returns the dereferenced OpenAPI spec for a context, either from the on-disk
 * cache at `~/.mihari/specs/<name>.json` or by fetching/parsing the source and
 * caching the result.
 */
export async function loadContextSpec(
  name: string,
  config: ContextConfig,
  options: LoadOptions = {},
): Promise<Oas> {
  const cachePath = contextSpecCachePath(name);
  if (!options.refresh && existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf8");
    const doc = JSON.parse(raw) as unknown;
    return new Oas(doc);
  }
  return refreshContextSpec(name, config);
}

export async function refreshContextSpec(
  name: string,
  config: ContextConfig,
): Promise<Oas> {
  const { document, baseFile } = await loadSource(config.spec);
  const resolved = await resolveRefs(document, baseFile);
  const errors = resolved.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    throw new MihariError(
      `Failed to resolve $ref in ${config.spec}: ${errors[0]!.message}`,
      "CONTEXT_RESOLVE_ERROR",
    );
  }
  await mkdir(dirname(contextSpecCachePath(name)), { recursive: true });
  await writeFile(
    contextSpecCachePath(name),
    JSON.stringify(resolved.document, null, 2),
    "utf8",
  );
  return new Oas(resolved.document);
}

async function loadSource(
  source: string,
): Promise<{ document: unknown; baseFile: string }> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new MihariError(
        `Failed to fetch ${source}: HTTP ${response.status}`,
        "CONTEXT_FETCH_ERROR",
      );
    }
    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const isYaml =
      /yaml/i.test(contentType) || /\.(ya?ml)(?:\?|$)/i.test(source);
    const format = isYaml ? "yaml" : "json";
    const parsed = parseContent(body, { format });
    if (parsed.issues.length) {
      throw new MihariError(
        `Failed to parse ${source}: ${parsed.issues[0]?.message}`,
        "CONTEXT_PARSE_ERROR",
      );
    }
    return { document: parsed.document, baseFile: source };
  }

  if (!existsSync(source)) {
    throw new MihariError(
      `Spec file not found: ${source}`,
      "CONTEXT_SPEC_MISSING",
    );
  }
  const parsed = await parseFile(source);
  if (parsed.issues.length) {
    throw new MihariError(
      `Failed to parse ${source}: ${parsed.issues[0]?.message}`,
      "CONTEXT_PARSE_ERROR",
    );
  }
  return { document: parsed.document, baseFile: source };
}

export async function invalidateContextCache(name: string): Promise<void> {
  const path = contextSpecCachePath(name);
  if (!existsSync(path)) return;
  try {
    await (await import("node:fs/promises")).unlink(path);
  } catch {
    // noop
  }
}

export function specsRoot(): string {
  return specsDir();
}
