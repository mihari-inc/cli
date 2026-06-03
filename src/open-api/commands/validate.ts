import { defineCommand } from "citty";

import { loadMihariConfig } from "../../shared/core/config.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import { format, isFormatKind, type FormatKind } from "../core/formatter.ts";
import { runChecks } from "../core/validator.ts";

export const validateCommand = defineCommand({
  meta: {
    name: "validate",
    description: "Validate OpenAPI files against the OpenAPI 3.0 spec",
  },
  args: {
    file: {
      type: "positional",
      required: false,
      description: "OpenAPI file to validate (overrides config)",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: stylish | json | github",
      default: "stylish",
    },
    "fail-on-warn": {
      type: "boolean",
      description: "Exit with code 1 if any warning is found",
      default: false,
    },
  },
  async run({ args }) {
    if (!isFormatKind(args.format)) {
      throw new MihariError(
        `Invalid --format "${args.format}". Expected: stylish | json | github`,
      );
    }
    const fmt: FormatKind = args.format;

    const config = await loadMihariConfig();
    const files = resolveFiles(args.file, config.openApi?.files);

    const summary = await runChecks({ files });
    process.stdout.write(format(summary, fmt));

    if (summary.totalErrors > 0 || (args["fail-on-warn"] && summary.totalWarnings > 0)) {
      logger.debug(
        `Exiting with code 1 (errors=${summary.totalErrors}, warnings=${summary.totalWarnings})`,
      );
      process.exit(1);
    }
  },
});

function resolveFiles(positional: string | undefined, fromConfig: string[] | undefined): string[] {
  if (positional) return [positional];
  if (fromConfig && fromConfig.length) return fromConfig;
  throw new MihariError(
    "No OpenAPI file provided. Pass a path or set openApi.files in mihari.config.ts",
    "OPENAPI_NO_INPUT",
  );
}
