import { defineMihariConfig } from "./src/shared/core/config.ts";

// Renommer en mihari.config.ts à la racine du projet qui consomme la CLI.
export default defineMihariConfig({
  changelogs: {
    output: "CHANGELOG.md",
    publish: {
      target: "api",
      // url et token peuvent venir de env: MIHARI_API_URL / MIHARI_API_TOKEN
    },
  },
  openApi: {
    files: ["docs/openapi.yaml"],
    lint: {
      extends: "recommended",
      rules: {
        // "operation-tags": "off",
        // "info-contact": "error",
      },
    },
  },
  api: {
    // url: "https://api.mihari.io",
  },
});
