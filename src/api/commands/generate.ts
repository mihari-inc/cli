import { defineCommand } from "citty";
import { resolve } from "node:path";

import { getCurrentContext } from "../../shared/context/config.ts";
import { loadContextSpec } from "../../shared/context/store.ts";
import { MihariError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import { selectOption } from "../../shared/utils/prompt.ts";

import { generateJest } from "../generators/jest.ts";
import { generatePlaywright } from "../generators/playwright.ts";
import { generateSdk } from "../generators/sdk.ts";
import { generateSdkGo } from "../generators/sdk-go.ts";
import { generateSdkJava } from "../generators/sdk-java.ts";
import { generateSdkPhp } from "../generators/sdk-php.ts";
import { generateSdkPython } from "../generators/sdk-python.ts";
import { generateSdkRust } from "../generators/sdk-rust.ts";
import { generateServer } from "../generators/server.ts";
import { writeGenerated, type GenerateResult } from "../generators/shared.ts";

type SdkLang = "ts" | "python" | "go" | "rust" | "java" | "php";
const SDK_LANGS: readonly SdkLang[] = ["ts", "python", "go", "rust", "java", "php"];

function isSdkLang(v: string): v is SdkLang {
  return (SDK_LANGS as readonly string[]).includes(v);
}

async function runGenerator(
  label: string,
  defaultOut: string,
  args: { out: string | undefined; force: boolean },
  build: (oas: Awaited<ReturnType<typeof loadContextSpec>>) => GenerateResult,
): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx) {
    throw new MihariError(
      "No current context. Run `mihari context add <name> --spec <path>` first.",
    );
  }
  const oas = await loadContextSpec(ctx.name, ctx.config);
  const outDir = resolve(args.out ?? defaultOut);
  const result = build(oas);
  const written = await writeGenerated(result, outDir, { force: args.force });
  logger.success(
    `Generated ${label} (${written.length} file${written.length === 1 ? "" : "s"}) → ${outDir}`,
  );
}

const serverCommand = defineCommand({
  meta: { name: "server", description: "Scaffold a Hono API server (1 handler per operation)" },
  args: {
    out: { type: "string", alias: "o", description: "Output directory (default: ./server)" },
    force: { type: "boolean", description: "Overwrite existing files", default: false },
  },
  async run({ args }) {
    await runGenerator("server", "./server", args, (oas) => generateServer(oas));
  },
});

const sdkCommand = defineCommand({
  meta: {
    name: "sdk",
    description:
      "Scaffold an SDK in TypeScript, Python, Go, Rust, Java or PHP (prompts interactively when --lang is omitted)",
  },
  args: {
    lang: {
      type: "string",
      alias: "l",
      description: `SDK language: ${SDK_LANGS.join(" | ")} (prompts when omitted on a TTY)`,
    },
    out: { type: "string", alias: "o", description: "Output directory (default: ./sdk-<lang>)" },
    force: { type: "boolean", description: "Overwrite existing files", default: false },
    "class-name": {
      type: "string",
      description: "Override the client class name (ts / python / java / php)",
    },
    "module-path": {
      type: "string",
      description: "Go only: module path written to go.mod",
    },
    "crate-name": {
      type: "string",
      description: "Rust only: crate name written to Cargo.toml",
    },
    "group-id": {
      type: "string",
      description: "Java only: Maven groupId (default: com.example)",
    },
    vendor: {
      type: "string",
      description: "PHP only: Composer vendor (default: example)",
    },
    async: {
      type: "boolean",
      description: "rust / java / php only: emit an async client",
      default: false,
    },
  },
  async run({ args }) {
    const lang = await resolveLang(args.lang);

    const isAsync = args.async === true;
    const defaultOut = `./sdk-${lang}${isAsync ? "-async" : ""}`;
    const className = args["class-name"];
    const modulePath = args["module-path"];
    const crateName = args["crate-name"];
    const groupId = args["group-id"];
    const vendor = args.vendor;

    await runGenerator(
      `${lang}${isAsync ? " async" : ""} SDK`,
      defaultOut,
      args,
      (oas) => {
        switch (lang) {
          case "ts":
            return generateSdk(oas, className ? { className } : {});
          case "python":
            return generateSdkPython(oas, className ? { className } : {});
          case "go":
            return generateSdkGo(oas, modulePath ? { modulePath } : {});
          case "rust":
            return generateSdkRust(oas, {
              ...(crateName ? { crateName } : {}),
              async: isAsync,
            });
          case "java":
            return generateSdkJava(oas, {
              ...(className ? { className } : {}),
              ...(groupId ? { groupId } : {}),
              async: isAsync,
            });
          case "php":
            return generateSdkPhp(oas, {
              ...(className ? { className } : {}),
              ...(vendor ? { vendor } : {}),
              async: isAsync,
            });
        }
      },
    );
  },
});

async function resolveLang(explicit: string | undefined): Promise<SdkLang> {
  if (explicit !== undefined) {
    if (!isSdkLang(explicit)) {
      throw new MihariError(
        `Invalid --lang "${explicit}". Expected: ${SDK_LANGS.join(" | ")}`,
      );
    }
    return explicit;
  }

  return selectOption<SdkLang>(
    "Pick an SDK language:",
    [
      { value: "ts", label: "TypeScript", description: "fetch-based, dual ESM/CJS, typed" },
      { value: "python", label: "Python", description: "requests-based, snake_case API" },
      { value: "go", label: "Go", description: "stdlib net/http, zero deps" },
      { value: "rust", label: "Rust", description: "reqwest::blocking + serde_json" },
      { value: "java", label: "Java", description: "java.net.http.HttpClient (JDK 11+) + Jackson" },
      { value: "php", label: "PHP", description: "Guzzle 7, PHP 8.1+" },
    ],
    "ts",
  );
}

const allCommand = defineCommand({
  meta: {
    name: "all",
    description:
      "Emit every SDK language in parallel into `<out>/<lang>/`. Use --skip / --only to scope.",
  },
  args: {
    out: {
      type: "string",
      alias: "o",
      description: "Output root (default: ./clients)",
      default: "./clients",
    },
    skip: {
      type: "string",
      description: "Comma-separated languages to skip",
    },
    only: {
      type: "string",
      description: "Comma-separated languages to include (defaults to all)",
    },
    force: { type: "boolean", description: "Overwrite existing files", default: false },
  },
  async run({ args }) {
    const ctx = await getCurrentContext();
    if (!ctx) {
      throw new MihariError(
        "No current context. Run `mihari context add <name> --spec <path>` first.",
      );
    }
    const oas = await loadContextSpec(ctx.name, ctx.config);

    const selected = resolveLanguageSet(args.only, args.skip);
    const rootOut = resolve(args.out);

    const tasks = selected.map(async (lang) => {
      const out = resolve(rootOut, lang);
      const result = await buildSdkForLang(oas, lang);
      const written = await writeGenerated(result, out, { force: args.force });
      return { lang, out, count: written.length };
    });

    const results = await Promise.allSettled(tasks);

    let ok = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        ok++;
        logger.success(
          `[${r.value.lang.padEnd(6)}] ${r.value.count} file${r.value.count === 1 ? "" : "s"} → ${r.value.out}`,
        );
      } else {
        failed++;
        logger.error(`${(r.reason as Error).message}`);
      }
    }

    logger.info(
      `Generated ${ok}/${ok + failed} SDK${ok + failed === 1 ? "" : "s"} (skipped ${SDK_LANGS.length - selected.length})`,
    );
    if (failed > 0) process.exit(1);
  },
});

function resolveLanguageSet(
  onlySpec: string | undefined,
  skipSpec: string | undefined,
): SdkLang[] {
  const parse = (raw: string): SdkLang[] => {
    const langs: SdkLang[] = [];
    for (const token of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!isSdkLang(token)) {
        throw new MihariError(
          `Unknown language "${token}". Expected one of: ${SDK_LANGS.join(" | ")}`,
        );
      }
      langs.push(token);
    }
    return langs;
  };

  if (onlySpec) return parse(onlySpec);
  const skip = new Set(skipSpec ? parse(skipSpec) : []);
  return SDK_LANGS.filter((l) => !skip.has(l));
}

function buildSdkForLang(
  oas: Awaited<ReturnType<typeof loadContextSpec>>,
  lang: SdkLang,
): Promise<GenerateResult> {
  switch (lang) {
    case "ts":
      return Promise.resolve(generateSdk(oas));
    case "python":
      return Promise.resolve(generateSdkPython(oas));
    case "go":
      return Promise.resolve(generateSdkGo(oas));
    case "rust":
      return Promise.resolve(generateSdkRust(oas));
    case "java":
      return Promise.resolve(generateSdkJava(oas));
    case "php":
      return Promise.resolve(generateSdkPhp(oas));
  }
}

const testsCommand = defineCommand({
  meta: { name: "tests", description: "Scaffold a blackbox test suite (Jest or Playwright)" },
  args: {
    framework: {
      type: "string",
      alias: "f",
      description: "Test framework: jest | playwright",
      default: "jest",
    },
    out: { type: "string", alias: "o", description: "Output directory (default: ./tests-<framework>)" },
    force: { type: "boolean", description: "Overwrite existing files", default: false },
  },
  async run({ args }) {
    if (args.framework !== "jest" && args.framework !== "playwright") {
      throw new MihariError(
        `Invalid --framework "${args.framework}". Expected: jest | playwright`,
      );
    }
    const framework = args.framework;
    const defaultOut = `./tests-${framework}`;
    await runGenerator(
      `${framework} tests`,
      defaultOut,
      args,
      (oas) => (framework === "jest" ? generateJest(oas) : generatePlaywright(oas)),
    );
  },
});

export const generateCommand = defineCommand({
  meta: {
    name: "generate",
    description: "Scaffold a server, SDK or test suite from the current context's spec",
  },
  subCommands: {
    all: allCommand,
    server: serverCommand,
    sdk: sdkCommand,
    tests: testsCommand,
  },
});
