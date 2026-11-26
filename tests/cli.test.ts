import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../src/cli.js";

describe("CLI end-to-end", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-cli-"));
    mkdirSync(join(tempDir, "src"), { recursive: true });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exits 0 when everything is in sync", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const url = process.env.API_URL;\n");
    writeFileSync(join(tempDir, ".env"), "API_URL=https://api.example.com\n");
    writeFileSync(join(tempDir, ".env.example"), "API_URL=\n");

    const code = runCli(["--dir", tempDir, "--ci"]);
    expect(code).toBe(0);
  });

  it("exits 1 in --ci mode when env vars are missing", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const k = process.env.MISSING_KEY;\n");
    writeFileSync(join(tempDir, ".env"), "");
    writeFileSync(join(tempDir, ".env.example"), "");

    const code = runCli(["--dir", tempDir, "--ci"]);
    expect(code).toBe(1);
  });

  it("outputs valid JSON with --json", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const k = process.env.STRIPE_KEY;\n");
    writeFileSync(join(tempDir, ".env"), "");

    const code = runCli(["--dir", tempDir, "--json"]);
    expect(code).toBe(0);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.missingInEnv).toEqual(["STRIPE_KEY"]);
  });

  it("updates .env.example with --sync and generates env.d.ts with --types", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const k = process.env.DATABASE_URL;\n");
    writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgres://secret\n");

    const code = runCli(["--dir", tempDir, "--sync", "--types"]);
    expect(code).toBe(0);

    const examplePath = join(tempDir, ".env.example");
    const typesPath = join(tempDir, "env.d.ts");

    expect(existsSync(examplePath)).toBe(true);
    expect(readFileSync(examplePath, "utf-8")).toBe("DATABASE_URL=\n");
    expect(existsSync(typesPath)).toBe(true);
    expect(readFileSync(typesPath, "utf-8")).toContain("DATABASE_URL: string;");
  });

  it("exits 0 in --ci mode when .env is absent (gitignored) and .env.example is in sync", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const url = process.env.API_URL;\n");
    writeFileSync(join(tempDir, ".env.example"), "API_URL=\n");

    const code = runCli(["--dir", tempDir, "--ci"]);
    expect(code).toBe(0);

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(output).toContain("No environment drift detected");
  });

  it("still exits 1 in --ci mode when .env is absent but .env.example is missing keys", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const url = process.env.API_URL;\n");
    writeFileSync(join(tempDir, ".env.example"), "");

    const code = runCli(["--dir", tempDir, "--ci"]);
    expect(code).toBe(1);
  });

  it("clears synced keys from the report and passes --ci after --sync", () => {
    writeFileSync(join(tempDir, "src", "index.ts"), "export const k = process.env.DATABASE_URL;\n");
    writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgres://secret\n");

    const code = runCli(["--dir", tempDir, "--sync", "--ci", "--json"]);
    expect(code).toBe(0);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.missingInExample).toEqual([]);
    expect(parsed.exampleFileExists).toBe(true);
  });

  it("prints package.json version with --version", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    const code = runCli(["--version"]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(pkg.version);
  });
});
