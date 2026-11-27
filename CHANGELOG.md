# Changelog

All notable changes to `@subramanyaks/env-drift` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-26

### Added
- **Real secret leak detection in `.env.example`:** Detects committed credentials (Stripe keys, GitHub tokens, AWS Access Key IDs, AI provider keys, Slack tokens, Google API keys, JWTs, PEM private keys, and connection URLs with real passwords) while ignoring empty values and common placeholders. Treated as a blocking issue in `--ci` mode.
- **Empty value detection in `.env`:** Flags keys referenced in code that exist in `.env` with blank values (`emptyInEnv`), respecting `.env.local` overrides.
- **Project configuration file support:** Automatically loads optional settings from `.envdriftrc.json` or the `"env-drift"` field in `package.json` (`envFile`, `exampleFile`, `ignore`, `ignoreDirs`, `publicPrefixes`, `sensitiveKeywords`). CLI flags override config values.
- **GitHub Actions inline PR annotations (`--format github`):** Emits `::error` and `::warning` workflow commands with file and line metadata so findings appear inline on PR diffs. Also added `--format <text|json|github>` (with `--json` kept as an alias).
- **Broader runtime support & inline ignore comments:** Added detection for `Bun.env` (dot, bracket, destructuring) and `Deno.env.get(...)`, plus `// env-drift-ignore` and `// env-drift-ignore-next-line` comments.
- **New public API exports:** Exported `loadConfig`, `detectExampleSecretLeak`, `formatGitHubAnnotations`, `EnvDriftConfig`, and `ExampleSecretLeak`.

## [1.0.1] - 2026-11-26

### Fixed
- **CI mode with gitignored `.env`:** `--ci` and `hasBlockingIssues()` no longer fail on `missingInEnv` when no local `.env` / `.env.local` file exists on disk, while still blocking on `missingInExample` and `secretExposures`. Added `envFileExists` and `exampleFileExists` to `AuditResult`.
- **Stale report after `--sync`:** Keys newly written to `.env.example` by `--sync` are now cleared from `result.missingInExample` before rendering the report/JSON or evaluating `--ci`.
- **Dynamic CLI version:** CLI `--version` now reads directly from `package.json` instead of a hardcoded string.
- **Cross-platform direct execution guard:** Replaced suffix-matching with `realpathSync` + `fileURLToPath(import.meta.url)` so CLI execution works reliably across Windows, macOS, and Linux shims.
- **Parser & scanner edge cases:** Properly unescapes `\"`, `\n`, `\r`, and `\t` inside double-quoted `.env` values, and detects optional-chained bracket access (`process.env?.["KEY"]`, `import.meta.env?.["KEY"]`).

## [1.0.0] - 2026-11-25

### Added
- Initial release of `@subramanyaks/env-drift` CLI and programmatic TypeScript/ESM/CJS library.
- Static codebase scanning for `process.env` and `import.meta.env` (dot, optional-chain, bracket, and destructuring access) while ignoring comments.
- Drift analysis detecting missing keys in `.env` and `.env.example`, unused/dead keys, duplicate keys, and client-exposed sensitive variable names (`NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`, etc.).
- Safe `--sync` to append missing keys as empty `KEY=` placeholders to `.env.example`.
- TypeScript `env.d.ts` declaration generator (`--types` / `--types-out`).
- CI exit code gating (`--ci`) and structured JSON output (`--json`).
