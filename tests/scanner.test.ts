import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractEnvReferences, scanFiles } from "../src/scanner.js";

describe("scanner", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-scanner-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("extracts dot, optional-chain, bracket, and destructured env references with exact line numbers", () => {
    const code = `
const url = process.env.DATABASE_URL;
const opt = process.env?.REDIS_URL;
const key = process.env["STRIPE_KEY"];
const viteUrl = import.meta.env.VITE_API_URL;
const {
  JWT_SECRET,
  PORT: serverPort,
  TIMEOUT = "5000",
  ...rest
} = process.env;
`;

    const refs = extractEnvReferences(code, "src/config.ts");
    expect(refs).toEqual([
      { name: "DATABASE_URL", file: "src/config.ts", line: 2, source: "process.env" },
      { name: "REDIS_URL", file: "src/config.ts", line: 3, source: "process.env" },
      { name: "STRIPE_KEY", file: "src/config.ts", line: 4, source: "process.env" },
      { name: "VITE_API_URL", file: "src/config.ts", line: 5, source: "import.meta.env" },
      { name: "JWT_SECRET", file: "src/config.ts", line: 7, source: "process.env" },
      { name: "PORT", file: "src/config.ts", line: 8, source: "process.env" },
      { name: "TIMEOUT", file: "src/config.ts", line: 9, source: "process.env" },
    ]);
  });

  it("ignores commented-out env references while preserving line numbers", () => {
    const code = `
// const old = process.env.OLD_SECRET;
/*
  const blockOld = process.env.BLOCK_SECRET;
*/
const active = process.env.ACTIVE_KEY;
`;

    const refs = extractEnvReferences(code, "src/app.ts");
    expect(refs).toEqual([
      { name: "ACTIVE_KEY", file: "src/app.ts", line: 6, source: "process.env" },
    ]);
  });

  it("walks project files and skips ignored directories like node_modules and dist", () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    mkdirSync(join(tempDir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(tempDir, "dist"), { recursive: true });

    writeFileSync(join(tempDir, "src", "index.ts"), "export const k = process.env.APP_KEY;\n");
    writeFileSync(join(tempDir, "node_modules", "pkg", "index.js"), "process.env.IGNORED_NM;\n");
    writeFileSync(join(tempDir, "dist", "index.js"), "process.env.IGNORED_DIST;\n");

    const { scannedFiles, references } = scanFiles(tempDir);
    expect(scannedFiles).toBe(1);
    expect(references.map((r) => r.name)).toEqual(["APP_KEY"]);
  });

  it("extracts optional-chained bracket access", () => {
    const code = `
const a = process.env?.["OPT_KEY"];
const b = import.meta.env?.['VITE_OPT'];
`;
    const refs = extractEnvReferences(code, "src/opt.ts");
    expect(refs).toEqual([
      { name: "OPT_KEY", file: "src/opt.ts", line: 2, source: "process.env" },
      { name: "VITE_OPT", file: "src/opt.ts", line: 3, source: "import.meta.env" },
    ]);
  });

  it("extracts Bun.env and Deno.env.get() references", () => {
    const code = `
const a = Bun.env.BUN_API_KEY;
const b = Bun.env["BUN_SECRET"];
const { BUN_PORT } = Bun.env;
const c = Deno.env.get("DENO_TOKEN");
const d = Deno.env?.get('DENO_URL');
`;
    const refs = extractEnvReferences(code, "src/runtime.ts");
    expect(refs).toEqual([
      { name: "BUN_API_KEY", file: "src/runtime.ts", line: 2, source: "Bun.env" },
      { name: "BUN_SECRET", file: "src/runtime.ts", line: 3, source: "Bun.env" },
      { name: "BUN_PORT", file: "src/runtime.ts", line: 4, source: "Bun.env" },
      { name: "DENO_TOKEN", file: "src/runtime.ts", line: 5, source: "Deno.env" },
      { name: "DENO_URL", file: "src/runtime.ts", line: 6, source: "Deno.env" },
    ]);
  });

  it("respects env-drift-ignore and env-drift-ignore-next-line comments", () => {
    const code = `
const a = process.env.KEPT_KEY;
// env-drift-ignore-next-line
const b = process.env.IGNORED_NEXT_LINE;
const c = process.env.IGNORED_SAME_LINE; // env-drift-ignore
const d = process.env.ALSO_KEPT;
`;
    const refs = extractEnvReferences(code, "src/ignore.ts");
    expect(refs.map((r) => r.name)).toEqual(["KEPT_KEY", "ALSO_KEPT"]);
  });
});
