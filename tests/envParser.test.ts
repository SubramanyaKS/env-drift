import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvContent, parseEnvFile, syncEnvExample } from "../src/envParser.js";

describe("envParser", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-parser-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses standard, quoted, exported, empty, and inline-commented values", () => {
    const content = `
# Database config
DATABASE_URL=postgres://localhost:5432/app
export API_KEY="secret#with#hash"
SINGLE_QUOTED='hello world'
PORT=3000 # local dev port
EMPTY_VAR=
`;

    const result = parseEnvContent(content);
    expect(result.keys).toEqual([
      "DATABASE_URL",
      "API_KEY",
      "SINGLE_QUOTED",
      "PORT",
      "EMPTY_VAR",
    ]);
    expect(result.values).toEqual({
      DATABASE_URL: "postgres://localhost:5432/app",
      API_KEY: "secret#with#hash",
      SINGLE_QUOTED: "hello world",
      PORT: "3000",
      EMPTY_VAR: "",
    });
    expect(result.duplicates).toEqual([]);
  });

  it("tracks duplicate keys and keeps the latest value", () => {
    const content = `
API_KEY=first
PORT=3000
API_KEY=second
`;
    const result = parseEnvContent(content);
    expect(result.keys).toEqual(["API_KEY", "PORT"]);
    expect(result.values.API_KEY).toBe("second");
    expect(result.duplicates).toEqual(["API_KEY"]);
  });

  it("returns exists: false when file does not exist", () => {
    const parsed = parseEnvFile(join(tempDir, ".env"));
    expect(parsed.exists).toBe(false);
    expect(parsed.keys).toEqual([]);
  });

  it("safely syncs missing keys to .env.example without copying real values", () => {
    const examplePath = join(tempDir, ".env.example");
    writeFileSync(examplePath, "EXISTING_KEY=placeholder\n", "utf-8");

    const res = syncEnvExample(examplePath, ["STRIPE_KEY", "DATABASE_URL", "EXISTING_KEY"]);
    expect(res).toEqual({ added: ["DATABASE_URL", "STRIPE_KEY"], created: false });

    const updated = readFileSync(examplePath, "utf-8");
    expect(updated).toBe("EXISTING_KEY=placeholder\nDATABASE_URL=\nSTRIPE_KEY=\n");
  });

  it("creates .env.example if it does not exist yet", () => {
    const examplePath = join(tempDir, ".env.example");
    const res = syncEnvExample(examplePath, ["API_URL"]);
    expect(res).toEqual({ added: ["API_URL"], created: true });
    expect(readFileSync(examplePath, "utf-8")).toBe("API_URL=\n");
  });
});
