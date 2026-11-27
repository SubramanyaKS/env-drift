import { resolve } from "node:path";
import { parseEnvFile } from "./envParser.js";
import { DEFAULT_IGNORE_DIRS, scanFiles } from "./scanner.js";
import type {
  AuditOptions,
  AuditResult,
  EnvReference,
  ExampleSecretLeak,
  SecretExposureWarning,
} from "./types.js";

export const BUILTIN_ENV_VARS = new Set([
  "NODE_ENV",
  "CI",
  "MODE",
  "DEV",
  "PROD",
  "SSR",
  "BASE_URL",
]);

export const PUBLIC_ENV_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "REACT_APP_",
  "NUXT_PUBLIC_",
  "PUBLIC_",
  "EXPO_PUBLIC_",
  "GATSBY_",
] as const;

export const SENSITIVE_KEYWORDS = [
  "SECRET",
  "PASSWORD",
  "PASSWD",
  "PRIVATE_KEY",
  "PRIVATE",
  "DATABASE_URL",
  "DB_URL",
  "DB_PASS",
  "JWT_SECRET",
  "AUTH_TOKEN",
  "ACCESS_KEY",
  "API_SECRET",
  "SERVICE_ROLE",
  "CREDENTIALS",
] as const;

const PLACEHOLDER_VALUE_PATTERNS = [
  /^your[_-]/i,
  /^my[_-]/i,
  /^change[_-]?me$/i,
  /^replace[_-]?me$/i,
  /^placeholder$/i,
  /^example$/i,
  /^dummy$/i,
  /^test$/i,
  /^todo$/i,
  /^<[^>]+>$/,
  /^\$\{[^}]+\}$/,
  /^[xX*]{4,}$/,
];

const PLACEHOLDER_URL_PASSWORDS = new Set([
  "password",
  "pass",
  "passwd",
  "postgres",
  "root",
  "admin",
  "changeme",
  "change_me",
  "secret",
  "example",
  "dummy",
  "test",
  "1234",
  "123456",
  "your_password",
  "<password>",
]);

const EXAMPLE_SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^sk_live_[A-Za-z0-9]{16,}$/, reason: "Stripe live secret key" },
  { pattern: /^rk_live_[A-Za-z0-9]{16,}$/, reason: "Stripe restricted live key" },
  { pattern: /^whsec_[A-Za-z0-9]{16,}$/, reason: "Stripe webhook secret" },
  { pattern: /^gh[pous]_[A-Za-z0-9]{20,}$/, reason: "GitHub access token" },
  { pattern: /^github_pat_[A-Za-z0-9_]{20,}$/, reason: "GitHub fine-grained token" },
  { pattern: /^AKIA[0-9A-Z]{16}$/, reason: "AWS Access Key ID" },
  { pattern: /^sk-(?:proj|ant)-[A-Za-z0-9_-]{20,}$/, reason: "AI provider API key" },
  { pattern: /^sk-[A-Za-z0-9]{32,}$/, reason: "Secret API key (sk-...)" },
  { pattern: /^xox[baprs]-[A-Za-z0-9-]{10,}$/, reason: "Slack token" },
  { pattern: /^AIza[0-9A-Za-z_-]{35}$/, reason: "Google API key" },
  {
    pattern: /^eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
    reason: "JWT token",
  },
  {
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
    reason: "PEM private key",
  },
];

const CONNECTION_URL_PASSWORD_REGEX =
  /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^:\s/]+:([^@\s/]+)@/i;

/**
 * Detects whether an `.env.example` value looks like a real committed secret
 * rather than an empty or placeholder value.
 */
export function detectExampleSecretLeak(
  _name: string,
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (PLACEHOLDER_VALUE_PATTERNS.some((re) => re.test(trimmed))) {
    return null;
  }

  for (const { pattern, reason } of EXAMPLE_SECRET_PATTERNS) {
    if (pattern.test(trimmed)) {
      return reason;
    }
  }

  const urlMatch = CONNECTION_URL_PASSWORD_REGEX.exec(trimmed);
  if (urlMatch) {
    const password = urlMatch[1] ?? "";
    if (
      password &&
      !PLACEHOLDER_URL_PASSWORDS.has(password.toLowerCase()) &&
      !PLACEHOLDER_VALUE_PATTERNS.some((re) => re.test(password))
    ) {
      return "Connection URL with embedded password";
    }
  }

  return null;
}

/**
 * Detects whether an environment variable name combines a client-exposed prefix
 * with a sensitive keyword (e.g. `NEXT_PUBLIC_DB_PASSWORD`).
 */
export function detectSecretExposure(
  name: string,
  options?: {
    publicPrefixes?: readonly string[];
    sensitiveKeywords?: readonly string[];
  }
): { prefix: string; matchedKeyword: string } | null {
  const upper = name.toUpperCase();
  const prefixes = options?.publicPrefixes?.length
    ? [...PUBLIC_ENV_PREFIXES, ...options.publicPrefixes.map((p) => p.toUpperCase())]
    : PUBLIC_ENV_PREFIXES;
  const keywords = options?.sensitiveKeywords?.length
    ? [...SENSITIVE_KEYWORDS, ...options.sensitiveKeywords.map((k) => k.toUpperCase())]
    : SENSITIVE_KEYWORDS;

  const prefix = prefixes.find((p) => upper.startsWith(p));
  if (!prefix) return null;

  const rest = upper.slice(prefix.length);
  const matchedKeyword = keywords.find((kw) => rest.includes(kw));
  if (!matchedKeyword) return null;

  return { prefix, matchedKeyword };
}

/**
 * Runs a full environment variable drift and security audit on a project directory.
 */
export function auditEnv(options: AuditOptions = {}): AuditResult {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const envFileName = options.envFile ?? ".env";
  const exampleFileName = options.exampleFile ?? ".env.example";
  const ignoreSet = new Set([...BUILTIN_ENV_VARS, ...(options.ignore ?? [])]);
  const ignoreDirs = options.ignoreDirs?.length
    ? [...DEFAULT_IGNORE_DIRS, ...options.ignoreDirs]
    : undefined;

  const { scannedFiles, references } = scanFiles(rootDir, { ignoreDirs });

  const usedInCode: Record<string, EnvReference[]> = {};
  for (const ref of references) {
    if (!usedInCode[ref.name]) {
      usedInCode[ref.name] = [];
    }
    usedInCode[ref.name]!.push(ref);
  }

  const parsedEnv = parseEnvFile(resolve(rootDir, envFileName));
  const parsedExample = parseEnvFile(resolve(rootDir, exampleFileName));

  // If using the default `.env`, also recognize keys defined in `.env.local`
  let envFileExists = parsedEnv.exists;
  const localEnvKeys = new Set(parsedEnv.keys);
  const localEnvValues: Record<string, string> = { ...parsedEnv.values };
  if (!options.envFile) {
    const parsedLocal = parseEnvFile(resolve(rootDir, ".env.local"));
    if (parsedLocal.exists) {
      envFileExists = true;
    }
    for (const key of parsedLocal.keys) {
      localEnvKeys.add(key);
      localEnvValues[key] = parsedLocal.values[key] ?? "";
    }
  }

  const exampleKeys = new Set(parsedExample.keys);
  const codeKeys = Object.keys(usedInCode);
  const codeKeySet = new Set(codeKeys);

  const missingInEnv = codeKeys
    .filter((k) => !ignoreSet.has(k) && !localEnvKeys.has(k))
    .sort();

  const missingInExample = codeKeys
    .filter((k) => !ignoreSet.has(k) && !exampleKeys.has(k))
    .sort();

  const emptyInEnv = codeKeys
    .filter(
      (k) =>
        !ignoreSet.has(k) &&
        localEnvKeys.has(k) &&
        (localEnvValues[k] ?? "").trim() === ""
    )
    .sort();

  const unusedInEnv = parsedEnv.keys
    .filter((k) => !ignoreSet.has(k) && !codeKeySet.has(k))
    .sort();

  const unusedInExample = parsedExample.keys
    .filter((k) => !ignoreSet.has(k) && !codeKeySet.has(k))
    .sort();

  const allKnownKeys = new Set([
    ...codeKeys,
    ...localEnvKeys,
    ...exampleKeys,
  ]);

  const secretExposures: SecretExposureWarning[] = [];
  for (const key of Array.from(allKnownKeys).sort()) {
    if (ignoreSet.has(key)) continue;
    const hit = detectSecretExposure(key, {
      publicPrefixes: options.publicPrefixes,
      sensitiveKeywords: options.sensitiveKeywords,
    });
    if (hit) {
      secretExposures.push({
        name: key,
        prefix: hit.prefix,
        matchedKeyword: hit.matchedKeyword,
        references: usedInCode[key] ?? [],
      });
    }
  }

  const exampleSecretLeaks: ExampleSecretLeak[] = [];
  for (const key of [...parsedExample.keys].sort()) {
    if (ignoreSet.has(key)) continue;
    const reason = detectExampleSecretLeak(key, parsedExample.values[key] ?? "");
    if (reason) {
      exampleSecretLeaks.push({
        name: key,
        reason,
        file: exampleFileName,
        line: parsedExample.lines[key] ?? 1,
      });
    }
  }

  return {
    rootDir,
    scannedFiles,
    envFileExists,
    exampleFileExists: parsedExample.exists,
    usedInCode,
    missingInEnv,
    missingInExample,
    emptyInEnv,
    unusedInEnv,
    unusedInExample,
    secretExposures,
    exampleSecretLeaks,
    duplicateKeys: {
      env: parsedEnv.duplicates,
      example: parsedExample.duplicates,
    },
  };
}
