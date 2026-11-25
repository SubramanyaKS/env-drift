import { resolve } from "node:path";
import { parseEnvFile } from "./envParser.js";
import { scanFiles } from "./scanner.js";
import type {
  AuditOptions,
  AuditResult,
  EnvReference,
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

/**
 * Detects whether an environment variable name combines a client-exposed prefix
 * with a sensitive keyword (e.g. `NEXT_PUBLIC_DB_PASSWORD`).
 */
export function detectSecretExposure(
  name: string
): { prefix: string; matchedKeyword: string } | null {
  const upper = name.toUpperCase();

  const prefix = PUBLIC_ENV_PREFIXES.find((p) => upper.startsWith(p));
  if (!prefix) return null;

  const rest = upper.slice(prefix.length);
  const matchedKeyword = SENSITIVE_KEYWORDS.find((kw) => rest.includes(kw));
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

  const { scannedFiles, references } = scanFiles(rootDir);

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
  const localEnvKeys = new Set(parsedEnv.keys);
  if (!options.envFile) {
    const parsedLocal = parseEnvFile(resolve(rootDir, ".env.local"));
    for (const key of parsedLocal.keys) {
      localEnvKeys.add(key);
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
    const hit = detectSecretExposure(key);
    if (hit) {
      secretExposures.push({
        name: key,
        prefix: hit.prefix,
        matchedKeyword: hit.matchedKeyword,
        references: usedInCode[key] ?? [],
      });
    }
  }

  return {
    rootDir,
    scannedFiles,
    usedInCode,
    missingInEnv,
    missingInExample,
    unusedInEnv,
    unusedInExample,
    secretExposures,
    duplicateKeys: {
      env: parsedEnv.duplicates,
      example: parsedExample.duplicates,
    },
  };
}
