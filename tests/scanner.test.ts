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
});
