import { loadConfig } from "c12";

import type { LintConfig } from "@mihari/oas";

export type PublishTarget = "api" | "webhook" | "discord";

export interface MihariConfig {
  changelogs?: {
    output?: string;
    publish?: {
      target?: PublishTarget;
      url?: string;
      token?: string;
    };
  };
  openApi?: {
    files?: string[];
    lint?: LintConfig;
  };
  api?: {
    url?: string;
    token?: string;
  };
}

const defaults: MihariConfig = {
  changelogs: {
    output: "CHANGELOG.md",
  },
};

export async function loadMihariConfig(cwd: string = process.cwd()): Promise<MihariConfig> {
  const { config } = await loadConfig<MihariConfig>({
    cwd,
    name: "mihari",
    defaults,
  });
  return config;
}

/**
 * Helper used in user land to get type inference on `mihari.config.ts`.
 *
 * @example
 *   import { defineMihariConfig } from "@mihari/cli/config";
 *   export default defineMihariConfig({ ... });
 */
export function defineMihariConfig(config: MihariConfig): MihariConfig {
  return config;
}
