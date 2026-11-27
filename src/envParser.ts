import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ParsedEnvFile } from "./types.js";

const ENV_LINE_REGEX = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function parseValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const quote = trimmed[0];
  if (quote === '"') {
    let result = "";
    for (let i = 1; i < trimmed.length; i++) {
      const ch = trimmed[i]!;
      if (ch === "\\" && i + 1 < trimmed.length) {
        const next = trimmed[i + 1]!;
        if (next === "n") result += "\n";
        else if (next === "r") result += "\r";
        else if (next === "t") result += "\t";
        else result += next;
        i++;
      } else if (ch === '"') {
        return result;
      } else {
        result += ch;
      }
    }
    return result;
  }

  if (quote === "'") {
    const closingIdx = trimmed.indexOf("'", 1);
    if (closingIdx !== -1) {
      return trimmed.slice(1, closingIdx);
    }
    return trimmed.slice(1);
  }

  // Strip inline comments for unquoted values (e.g. PORT=3000 # dev port)
  const commentIdx = trimmed.indexOf(" #");
  if (commentIdx !== -1) {
    return trimmed.slice(0, commentIdx).trim();
  }

  return trimmed;
}

/**
 * Parses the text contents of a .env file without external dependencies.
 */
export function parseEnvContent(content: string): {
  keys: string[];
  values: Record<string, string>;
  lines: Record<string, number>;
  duplicates: string[];
} {
  const keys: string[] = [];
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();
  const values: Record<string, string> = {};
  const keyLines: Record<string, number> = {};

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = ENV_LINE_REGEX.exec(line);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2] ?? "";
    if (!key) continue;

    if (seen.has(key)) {
      duplicateSet.add(key);
    } else {
      seen.add(key);
      keys.push(key);
    }

    values[key] = parseValue(rawValue);
    keyLines[key] = i + 1;
  }

  return {
    keys,
    values,
    lines: keyLines,
    duplicates: Array.from(duplicateSet),
  };
}

/**
 * Reads and parses a .env file from disk. Returns `exists: false` if missing.
 */
export function parseEnvFile(filePath: string): ParsedEnvFile {
  if (!existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      keys: [],
      values: {},
      lines: {},
      duplicates: [],
    };
  }

  const content = readFileSync(filePath, "utf-8");
  const { keys, values, lines, duplicates } = parseEnvContent(content);

  return {
    filePath,
    exists: true,
    keys,
    values,
    lines,
    duplicates,
  };
}

/**
 * Safely appends missing keys to `.env.example` as `KEY=` placeholders (never copies real values).
 */
export function syncEnvExample(
  examplePath: string,
  missingKeys: string[]
): { added: string[]; created: boolean } {
  const uniqueKeys = Array.from(new Set(missingKeys)).sort();
  if (uniqueKeys.length === 0) {
    return { added: [], created: false };
  }

  const created = !existsSync(examplePath);
  const existingContent = created ? "" : readFileSync(examplePath, "utf-8");
  const existingKeys = new Set(parseEnvContent(existingContent).keys);

  const toAdd = uniqueKeys.filter((k) => !existingKeys.has(k));
  if (toAdd.length === 0) {
    return { added: [], created: false };
  }

  const linesBlock = toAdd.map((k) => `${k}=`).join("\n") + "\n";

  let nextContent: string;
  if (created || existingContent.trim() === "") {
    nextContent = linesBlock;
  } else {
    const separator = existingContent.endsWith("\n") ? "" : "\n";
    nextContent = `${existingContent}${separator}${linesBlock}`;
  }

  writeFileSync(examplePath, nextContent, "utf-8");
  return { added: toAdd, created };
}
