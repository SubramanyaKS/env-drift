import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EnvDriftConfig } from "./types.js";

function toStringArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  return val.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeConfig(raw: unknown): EnvDriftConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;

  const config: EnvDriftConfig = {};
  if (typeof obj.envFile === "string" && obj.envFile.trim()) {
    config.envFile = obj.envFile.trim();
  }
  if (typeof obj.exampleFile === "string" && obj.exampleFile.trim()) {
    config.exampleFile = obj.exampleFile.trim();
  }

  const ignore = toStringArray(obj.ignore);
  if (ignore) config.ignore = ignore;

  const ignoreDirs = toStringArray(obj.ignoreDirs);
  if (ignoreDirs) config.ignoreDirs = ignoreDirs;

  const publicPrefixes = toStringArray(obj.publicPrefixes);
  if (publicPrefixes) config.publicPrefixes = publicPrefixes;

  const sensitiveKeywords = toStringArray(obj.sensitiveKeywords);
  if (sensitiveKeywords) config.sensitiveKeywords = sensitiveKeywords;

  return config;
}

/**
 * Loads optional project configuration from `.envdriftrc.json` or the `"env-drift"`
 * field in `package.json`.
 */
export function loadConfig(rootDir: string): EnvDriftConfig {
  const rcPath = resolve(rootDir, ".envdriftrc.json");
  if (existsSync(rcPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(rcPath, "utf-8"));
      return normalizeConfig(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse .envdriftrc.json: ${msg}`);
    }
  }

  const pkgPath = resolve(rootDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && parsed["env-drift"]) {
        return normalizeConfig(parsed["env-drift"]);
      }
    } catch {
      // Ignore invalid package.json when looking for optional config
    }
  }

  return {};
}
