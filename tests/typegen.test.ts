import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { auditEnv } from "../src/analyzer.js";
import { generateEnvTypes, writeEnvTypes } from "../src/typegen.js";

describe("typegen", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-typegen-"));
    mkdirSync(join(tempDir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates ProcessEnv and ImportMetaEnv declarations", () => {
    writeFileSync(
      join(tempDir, "src", "app.ts"),
      `
const db = process.env.DATABASE_URL;
const api = import.meta.env.VITE_API_URL;
const mode = process.env.NODE_ENV;
`
    );

    const audit = auditEnv({ rootDir: tempDir });
    const dts = generateEnvTypes(audit);

    expect(dts).toContain("interface ProcessEnv");
    expect(dts).toContain("DATABASE_URL: string;");
    expect(dts).toContain("interface ImportMetaEnv");
    expect(dts).toContain("readonly VITE_API_URL: string;");
    expect(dts).not.toContain("NODE_ENV");
  });

  it("writes env.d.ts to disk creating nested directories if needed", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const a = process.env.PORT;\n");
    const audit = auditEnv({ rootDir: tempDir });
    const outPath = join(tempDir, "types", "env.d.ts");

    const res = writeEnvTypes(outPath, audit);
    expect(res.count).toBe(1);
    expect(readFileSync(outPath, "utf-8")).toContain("PORT: string;");
  });
});
