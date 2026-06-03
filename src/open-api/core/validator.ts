import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { validateFile } from "@mihari/oas";

import { MihariError } from "../../shared/utils/errors.ts";
import type { FileResult, ValidationSummary } from "./types.ts";

export interface RunOptions {
  files: string[];
}

export async function runChecks(opts: RunOptions): Promise<ValidationSummary> {
  if (!opts.files.length) {
    throw new MihariError("No OpenAPI file provided", "OPENAPI_NO_INPUT");
  }

  const results: FileResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const rawPath of opts.files) {
    const absolutePath = resolve(rawPath);
    if (!existsSync(absolutePath)) {
      throw new MihariError(`File not found: ${rawPath}`, "OPENAPI_FILE_NOT_FOUND");
    }

    const result = await validateFile(absolutePath);
    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    const warningCount = result.issues.filter((i) => i.severity === "warn").length;

    totalErrors += errorCount;
    totalWarnings += warningCount;

    results.push({
      file: absolutePath,
      version: result.version,
      issues: result.issues,
      errorCount,
      warningCount,
    });
  }

  return { files: results, totalErrors, totalWarnings };
}
