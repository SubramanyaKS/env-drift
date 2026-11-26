import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { EnvReference } from "./types.js";

export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".vercel",
  ".turbo",
  "coverage",
  "out",
  ".cache",
]);

export const DEFAULT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
]);

/**
 * Strips JS/TS comments while preserving newline counts so line numbers remain exact.
 */
function stripCommentsPreservingLines(source: string): string {
  // Matches: strings ("...", '...', `...`), block comments, or line comments
  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g;

  return source.replace(tokenRegex, (match, stringLiteral: string | undefined) => {
    if (stringLiteral) return match;
    return match.replace(/[^\r\n]/g, " ");
  });
}

function getLineNumber(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Extracts all `process.env` and `import.meta.env` references from a source string.
 */
export function extractEnvReferences(
  content: string,
  filePath: string
): EnvReference[] {
  const cleaned = stripCommentsPreservingLines(content);
  const refs: EnvReference[] = [];
  const normalizedFile = filePath.replace(/\\/g, "/");

  // 1. Dot access: process.env.FOO / process.env?.FOO / import.meta.env.VITE_FOO
  const dotRegex =
    /\b(process\.env|import\.meta\.env)\s*\??\.\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (const match of cleaned.matchAll(dotRegex)) {
    const source = match[1] as "process.env" | "import.meta.env";
    const name = match[2];
    if (!name || match.index === undefined) continue;
    refs.push({
      name,
      file: normalizedFile,
      line: getLineNumber(cleaned, match.index),
      source,
    });
  }

  // 2. Bracket access: process.env["FOO"] / process.env['FOO'] / process.env?.["FOO"]
  const bracketRegex =
    /\b(process\.env|import\.meta\.env)\s*(?:\?\.)?\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g;
  for (const match of cleaned.matchAll(bracketRegex)) {
    const source = match[1] as "process.env" | "import.meta.env";
    const name = match[2];
    if (!name || match.index === undefined) continue;
    refs.push({
      name,
      file: normalizedFile,
      line: getLineNumber(cleaned, match.index),
      source,
    });
  }

  // 3. Destructuring: const { FOO, BAR: bar, BAZ = "x" } = process.env
  const destructureRegex =
    /\{([^}]+)\}\s*=\s*(process\.env|import\.meta\.env)\b/g;
  for (const match of cleaned.matchAll(destructureRegex)) {
    const body = match[1];
    const source = match[2] as "process.env" | "import.meta.env";
    if (!body || match.index === undefined) continue;

    const bodyStart = match.index + 1;
    let offset = 0;

    for (const part of body.split(",")) {
      const partIdx = body.indexOf(part, offset);
      offset = partIdx + part.length + 1;

      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("...")) continue;

      // Capture property name before optional `: alias` or `= default`
      const keyMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
      const name = keyMatch?.[1];
      if (!name) continue;

      const leadingWs = part.indexOf(name);
      const absoluteIdx = bodyStart + partIdx + Math.max(0, leadingWs);

      refs.push({
        name,
        file: normalizedFile,
        line: getLineNumber(cleaned, absoluteIdx),
        source,
      });
    }
  }

  refs.sort((a, b) => a.line - b.line);
  return refs;
}

export interface ScanOptions {
  ignoreDirs?: string[];
  extensions?: string[];
}

/**
 * Recursively walks `rootDir` and extracts all environment variable references.
 */
export function scanFiles(
  rootDir: string,
  options: ScanOptions = {}
): { scannedFiles: number; references: EnvReference[] } {
  const ignoreDirs = options.ignoreDirs
    ? new Set(options.ignoreDirs)
    : DEFAULT_IGNORE_DIRS;
  const extensions = options.extensions
    ? new Set(options.extensions)
    : DEFAULT_EXTENSIONS;

  let scannedFiles = 0;
  const references: EnvReference[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!extensions.has(ext)) continue;

        // Skip huge generated files (> 2MB) to stay fast
        const size = statSync(fullPath).size;
        if (size > 2 * 1024 * 1024) continue;

        scannedFiles++;
        const content = readFileSync(fullPath, "utf-8");
        const relPath = relative(rootDir, fullPath);
        const fileRefs = extractEnvReferences(content, relPath);
        references.push(...fileRefs);
      }
    }
  }

  walk(rootDir);

  return { scannedFiles, references };
}
