import { defineCommand } from "citty";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { bundleFile, type BundleFormat, type BundleStrategy } from "@mihari/oas";

import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";

function isBundleFormat(v: string): v is BundleFormat {
  return v === "yaml" || v === "json";
}

function isBundleStrategy(v: string): v is BundleStrategy {
  return v === "inline" || v === "lift";
}

export const bundleCommand = defineCommand({
  meta: {
    name: "bundle",
    description: "Resolve every external $ref and emit a single-file OpenAPI document",
  },
  args: {
    file: {
      type: "positional",
      required: true,
      description: "Entry OpenAPI file to bundle",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Destination file (default: stdout)",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: yaml | json (default: inferred from file / output extension)",
    },
    strategy: {
      type: "string",
      alias: "s",
      description: "Bundle strategy: inline | lift (default: inline)",
      default: "inline",
    },
  },
  async run({ args }) {
    let format: BundleFormat | undefined;
    if (args.format !== undefined) {
      if (!isBundleFormat(args.format)) {
        throw new MihariError(
          `Invalid --format "${args.format}". Expected: yaml | json`,
        );
      }
      format = args.format;
    } else if (args.output) {
      const ext = args.output.toLowerCase();
      if (ext.endsWith(".json")) format = "json";
      else if (ext.endsWith(".yaml") || ext.endsWith(".yml")) format = "yaml";
    }

    if (!isBundleStrategy(args.strategy)) {
      throw new MihariError(
        `Invalid --strategy "${args.strategy}". Expected: inline | lift`,
      );
    }
    const strategy = args.strategy;

    const result = await bundleFile(args.file, {
      strategy,
      ...(format !== undefined ? { format } : {}),
    });

    if (result.issues.some((i) => i.severity === "error")) {
      for (const issue of result.issues) {
        if (issue.severity === "error") {
          logger.error(`${issue.pointer}  ${issue.keyword}  ${issue.message}`);
        }
      }
      process.exit(1);
    }

    if (args.output) {
      const outPath = resolve(args.output);
      await writeFile(outPath, result.content, "utf8");
      logger.success(`Wrote bundled ${result.format} to ${outPath}`);
      const liftedMsg = result.strategy === "lift" ? `, lifted ${result.liftedCount} schema(s)` : "";
      logger.info(`Inlined ${result.resolvedFiles.length} external file(s)${liftedMsg}`);
    } else {
      process.stdout.write(result.content);
    }
  },
});
