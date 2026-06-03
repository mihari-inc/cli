# Mihari CLI

Command-line interface to interact with Mihari services. Starts with git-based changelog tooling; future domains (uptime, telemetry, open-api, …) will plug into the same surface.

## Install

### Homebrew (coming soon)

```sh
brew install mihari/tap/mihari
```

Release pipeline publishes a tap-ready tarball per OS/arch. Enable the `bump-homebrew` job in `.github/workflows/release.yml` once the `mihari/homebrew-tap` repository exists.

### npm / bun (requires Bun ≥ 1.1)

```sh
bun add -g @mihari/cli
# or
npm install -g @mihari/cli
```

### One-shot binary (GitHub Releases)

Each tagged release produces standalone binaries in `dist/mihari-<os>-<arch>.tar.gz`. Download, extract, put on `$PATH`.

## Usage

```sh
# Contexts & generic API execution
mihari context add mihari --spec https://api.mihari.io/openapi.yaml --auth-bearer $TOKEN
mihari context list
mihari context use mihari
mihari api list                              # list every operation in the current spec
mihari api show listMonitors                 # details: params, body, responses, security
mihari api call getMonitor --param id=m_123
mihari api call createMonitor --body @monitor.json
mihari api call listMonitors --dry-run       # inspect the request without sending it

# Code generation from the current context's spec
mihari api generate server --out ./server             # Hono server with one stub per operation
mihari api generate sdk --out ./sdk                   # TypeScript SDK + generated types
mihari api generate sdk --class-name UptimeClient --out ./sdk
mihari api generate tests --framework jest --out ./tests-jest
mihari api generate tests --framework playwright --out ./tests-pw

# Changelogs
mihari changelogs generate              # preview next section (stdout or file)
mihari changelogs generate --stdout
mihari changelogs release --type auto   # bump semver, tag, update CHANGELOG.md
mihari changelogs release --push        # + push tag
mihari changelogs publish --version v1.2.0 --target discord --url "$DISCORD_WEBHOOK"

# OpenAPI
mihari open-api validate openapi.yaml                       # structural validation (resolves $ref)
mihari open-api validate openapi.yaml --format json
mihari open-api validate openapi.yaml --format github       # GitHub Actions annotations
mihari open-api lint openapi.yaml                           # best-practice rules
mihari open-api lint --list-rules                           # introspect the rule set
mihari open-api lint openapi.yaml --fail-on-warn
mihari open-api bundle openapi.yaml -o bundled.yaml         # inline every external $ref
mihari open-api diff old.yaml new.yaml                      # classify changes (breaking / non-breaking / info)
mihari open-api diff old.yaml new.yaml --ignore-metadata --no-fail-on-breaking
```

The `--type auto` policy follows [conventional commits](https://www.conventionalcommits.org/):

- `BREAKING CHANGE` footer or `feat!`/`fix!` → **major**
- at least one `feat:` → **minor**
- otherwise → **patch**

## Configuration

Drop a `mihari.config.ts` at the root of the project that consumes the CLI:

```ts
import { defineMihariConfig } from "@mihari/cli/config";

export default defineMihariConfig({
  changelogs: {
    output: "CHANGELOG.md",
    publish: {
      target: "api",
    },
  },
  api: {
    url: "https://api.mihari.io",
  },
});
```

Environment variables also work: `MIHARI_API_URL`, `MIHARI_API_TOKEN`, `MIHARI_DEBUG`, `MIHARI_HOME` (defaults to `~/.mihari`).

## Contexts

Contexts let you register one or more OpenAPI specs locally and execute their operations directly from the CLI. Everything lives under `~/.mihari/`:

```
~/.mihari/
├── config.json        # contexts + current pointer (chmod 0600 — credentials live here)
└── specs/
    └── <name>.json    # dereferenced spec cache
```

The cache is refreshed on demand with `mihari context refresh`. Credentials are stored in plain JSON with owner-only permissions today; keychain integration is a future improvement.

Supported auth types:
- `bearer` — via `--auth-bearer <token>`
- `apiKey` in header — via `--auth-apikey-header X-API-Key=<value>`
- More types (apiKey in query, basic, OAuth2 flows) are on the roadmap.

OpenAPI validation is powered by the sibling package [`@mihari/oas`](../oas) and supports both OpenAPI 3.0 and 3.1. See the oas package README for scope and the 3.1 Schema Object trade-off.

> Note: the `api` publish target posts to `POST {url}/changelogs`. The server-side endpoint is not implemented yet — the client payload shape is documented in `src/changelogs/core/types.ts`.

## Use in GitHub Actions

```yaml
- uses: oven-sh/setup-bun@v2
- run: bunx @mihari/cli changelogs release --type auto --push
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Structure

Code is organised by **domain** (`changelogs/`, later `uptime/`, `telemetry/`, `open-api/`). Each domain owns:

```
src/<domain>/
├── core/        # pure business logic, no CLI deps
├── commands/    # thin citty bindings → core
└── index.ts     # aggregates sub-commands
```

`src/shared/` contains cross-cutting helpers (git, http, config, logger).

## Development

```sh
bun install
bun run dev changelogs generate --stdout
bun test
bun run typecheck
bun run build        # compile a standalone binary to dist/mihari
```
