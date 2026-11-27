# @subramanyaks/env-drift

[![npm version](https://img.shields.io/npm/v/@subramanyaks/env-drift.svg)](https://www.npmjs.com/package/@subramanyaks/env-drift)
[![npm downloads](https://img.shields.io/npm/dm/@subramanyaks/env-drift.svg)](https://www.npmjs.com/package/@subramanyaks/env-drift)
[![CI](https://github.com/SubramanyaKS/env-drift/actions/workflows/ci.yml/badge.svg)](https://github.com/SubramanyaKS/env-drift/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Zero-config CLI and TypeScript library that detects **environment variable drift**, **missing keys**, **dead vars**, and **accidental public secret exposure** across JS, TS, React, Next.js, Vite, and Node.js projects.

## Why `@subramanyaks/env-drift`?

Runtime validators are great, but they require adding code and only fail *after* your app boots. `env-drift` statically audits your repo in milliseconds with **zero setup**:

- **Missing in `.env`** — Catch `process.env.STRIPE_KEY`, `import.meta.env.VITE_API_URL`, `Bun.env.API_KEY`, or `Deno.env.get("TOKEN")` before runtime crashes.
- **Missing in `.env.example`** — Keep teammate onboarding in sync (with `--sync` to safely append `KEY=` placeholders without ever copying secret values).
- **Empty Values in `.env`** — Catch keys that exist in `.env` as `STRIPE_KEY=` with no value set.
- **Unused / Dead vars** — Spot stale keys left behind in `.env` and `.env.example`.
- **Public Secret Exposure** — Flags dangerous client-exposed names like `NEXT_PUBLIC_DB_PASSWORD` or `VITE_JWT_SECRET`.
- **Real Secrets in `.env.example`** — Detects real API keys, tokens, JWTs, PEM private keys, and DB passwords accidentally committed to `.env.example`.
- **Type Generation** — Auto-generate `env.d.ts` (`NodeJS.ProcessEnv` + `ImportMetaEnv`) with `--types`.
- **CI & GitHub PR Annotations** — Drop `npx @subramanyaks/env-drift --ci --format github` into GitHub Actions to annotate PR diffs directly.

## Quick Start

Run directly in any project with `npx`:

```bash
npx @subramanyaks/env-drift
```

### Example Output

```text
env-drift — scanned 24 files

✖ Possible Public Secret Exposure (1)
  • NEXT_PUBLIC_DB_PASSWORD (public prefix "NEXT_PUBLIC_" + sensitive "PASSWORD") ← src/db.ts:14

✖ Missing in .env (2)
  • NEXT_PUBLIC_DB_PASSWORD ← src/db.ts:14
  • STRIPE_WEBHOOK_SECRET ← src/api/webhook.ts:8

⚠ Missing in .env.example (2)
  • NEXT_PUBLIC_DB_PASSWORD ← src/db.ts:14
  • STRIPE_WEBHOOK_SECRET ← src/api/webhook.ts:8

○ Unused in .env (1)
  • LEGACY_API_KEY

Tip: Run with --sync to safely append missing keys to .env.example.
```

## CLI Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-d, --dir <path>` | Project directory to scan | `.` |
| `--env <file>` | Local env file name (also reads `.env.local` by default) | `.env` |
| `--example <file>` | Example env file name | `.env.example` |
| `--ignore <vars>` | Comma-separated env variable names to ignore | — |
| `--sync` | Safely append missing keys to `.env.example` as `KEY=` | `false` |
| `--types` | Generate `env.d.ts` for detected env variables | `false` |
| `--types-out <path>` | Custom output path for `--types` | `env.d.ts` |
| `--ci` | Exit with code `1` if missing vars or secret leaks are found (skips local `.env` check when `.env` is absent) | `false` |
| `--format <type>` | Output format: `text`, `json`, or `github` (GitHub Actions annotations) | `text` |
| `--json` | Output structured JSON (`AuditResult`) — alias for `--format json` | `false` |
| `-v, --version` | Print version | — |
| `-h, --help` | Print help message | — |

### Common Commands

```bash
# Sync missing keys into .env.example (empty placeholders only)
npx @subramanyaks/env-drift --sync

# Generate env.d.ts for TypeScript autocomplete
npx @subramanyaks/env-drift --types

# Run in CI (fails build on missing vars or public secret leaks)
npx @subramanyaks/env-drift --ci

# Ignore specific platform variables
npx @subramanyaks/env-drift --ignore VERCEL_URL,RAILWAY_ENVIRONMENT
```

## GitHub Actions CI Recipe

Add this step to your `.github/workflows/ci.yml` to block PRs with undocumented env vars or leaked secrets and render inline PR annotations:

```yaml
- name: Check environment drift
  run: npx @subramanyaks/env-drift --ci --format github
```

## Configuration File (Optional)

You can persist options in `.envdriftrc.json` (or under an `"env-drift"` key in `package.json`):

```json
{
  "envFile": ".env",
  "exampleFile": ".env.example",
  "ignore": ["VERCEL_URL", "RAILWAY_ENVIRONMENT"],
  "ignoreDirs": ["generated"],
  "publicPrefixes": ["CUSTOM_PUBLIC_"],
  "sensitiveKeywords": ["MASTER_KEY"]
}
```

CLI flags always override config file values.

## Programmatic API

Install as a dev dependency to use in custom scripts:

```bash
npm install -D @subramanyaks/env-drift
```

```ts
import { auditEnv, hasBlockingIssues } from "@subramanyaks/env-drift";

const result = auditEnv({
  rootDir: process.cwd(),
  ignore: ["VERCEL_URL"],
});

if (hasBlockingIssues(result)) {
  console.error("Env drift detected:", result.missingInExample);
  process.exit(1);
}
```

## What Patterns Are Detected?

- `process.env.API_KEY`, `process.env?.API_KEY`, `process.env["API_KEY"]`, and `process.env?.["API_KEY"]`
- `const { API_KEY, PORT: port = "3000" } = process.env`
- `import.meta.env.VITE_API_URL` and destructuring from `import.meta.env`
- `Bun.env.API_KEY`, `Bun.env["API_KEY"]`, and `Deno.env.get("API_KEY")`
- Inline ignore comments: `// env-drift-ignore` and `// env-drift-ignore-next-line`
- Commented-out code (`//` and `/* ... */`) is automatically ignored.
- Standard built-ins (`NODE_ENV`, `CI`, `MODE`, `DEV`, `PROD`, `SSR`, `BASE_URL`) are ignored by default.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Author

[Subramanya KS](https://github.com/SubramanyaKS)

## License

MIT — see [LICENSE](./LICENSE) for details.
