import { defineCommand } from "citty";

import { lintFile, listRules, type LintConfig } from "@mihari/oas";

import { loadMihariConfig } from "../../shared/core/config.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import { format, isFormatKind, type FormatKind } from "../core/formatter.ts";
import type { FileResult, ValidationSummary } from "../core/types.ts";

export const lintCommand = defineCommand({
  meta: {
    name: "lint",
    description: "Lint OpenAPI files against best-practice rules",
  },
  args: {
    file: {
      type: "positional",
      required: false,
      description: "OpenAPI file to lint (overrides config)",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: stylish | json | github",
      default: "stylish",
    },
    "list-rules": {
      type: "boolean",
      description: "Print the built-in rule set and exit",
      default: false,
    },
    "fail-on-warn": {
      type: "boolean",
      description: "Exit with code 1 if any warning is found",
      default: false,
    },
  },
  async run({ args }) {
    if (args["list-rules"]) {
      for (const rule of listRules()) {
        process.stdout.write(
          `${rule.id.padEnd(36)}  ${rule.defaultSeverity.padEnd(5)}  ${rule.description}\n`,
        );
      }
      return;
    }

    if (!isFormatKind(args.format)) {
      throw new MihariError(
        `Invalid --format "${args.format}". Expected: stylish | json | github`,
      );
    }
    const fmt: FormatKind = args.format;

    const mihariConfig = await loadMihariConfig();
    const files = resolveFiles(args.file, mihariConfig.openApi?.files);
    const lintConfig: LintConfig = mihariConfig.openApi?.lint ?? {};

    const summary = await runLint(files, lintConfig);
    process.stdout.write(format(summary, fmt));

    if (summary.totalErrors > 0 || (args["fail-on-warn"] && summary.totalWarnings > 0)) {
      logger.debug(
        `Exiting with code 1 (errors=${summary.totalErrors}, warnings=${summary.totalWarnings})`,
      );
      process.exit(1);
    }
  },
});

async function runLint(files: string[], config: LintConfig): Promise<ValidationSummary> {
  const results: FileResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of files) {
    const result = await lintFile(file, config);
    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    const warningCount = result.issues.filter((i) => i.severity === "warn").length;
    totalErrors += errorCount;
    totalWarnings += warningCount;
    results.push({
      file,
      version: null,
      issues: result.issues,
      errorCount,
      warningCount,
    });
  }

  return { files: results, totalErrors, totalWarnings };
}

function resolveFiles(positional: string | undefined, fromConfig: string[] | undefined): string[] {
  if (positional) return [positional];
  if (fromConfig && fromConfig.length) return fromConfig;
  throw new MihariError(
    "No OpenAPI file provided. Pass a path or set openApi.files in mihari.config.ts",
    "OPENAPI_NO_INPUT",
  );
}
