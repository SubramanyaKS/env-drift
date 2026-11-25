import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditEnv, detectSecretExposure } from "../src/analyzer.js";

describe("analyzer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-analyzer-"));
    mkdirSync(join(tempDir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects missing, unused, duplicate, and publicly exposed secrets", () => {
    writeFileSync(
      join(tempDir, "src", "server.ts"),
      `
const env = process.env.NODE_ENV;
const db = process.env.DATABASE_URL;
const stripe = process.env.STRIPE_KEY;
const leaked = process.env.NEXT_PUBLIC_DB_PASSWORD;
`
    );

    writeFileSync(
      join(tempDir, ".env"),
      `DATABASE_URL=postgres://localhost/db
UNUSED_LOCAL=123
DATABASE_URL=postgres://localhost/db2
`
    );

    writeFileSync(
      join(tempDir, ".env.example"),
      `DATABASE_URL=
UNUSED_EXAMPLE=
`
    );

    const result = auditEnv({ rootDir: tempDir });

    // NODE_ENV is a built-in and should not be flagged
    expect(result.missingInEnv).toEqual(["NEXT_PUBLIC_DB_PASSWORD", "STRIPE_KEY"]);
    expect(result.missingInExample).toEqual(["NEXT_PUBLIC_DB_PASSWORD", "STRIPE_KEY"]);
    expect(result.unusedInEnv).toEqual(["UNUSED_LOCAL"]);
    expect(result.unusedInExample).toEqual(["UNUSED_EXAMPLE"]);
    expect(result.duplicateKeys.env).toEqual(["DATABASE_URL"]);
    expect(result.secretExposures).toHaveLength(1);
    expect(result.secretExposures[0]?.name).toBe("NEXT_PUBLIC_DB_PASSWORD");
    expect(result.secretExposures[0]?.prefix).toBe("NEXT_PUBLIC_");
    expect(result.secretExposures[0]?.matchedKeyword).toBe("PASSWORD");
  });

  it("recognizes keys defined in .env.local when using default .env", () => {
    writeFileSync(join(tempDir, "src", "app.ts"), "export const k = process.env.LOCAL_ONLY_KEY;\n");
    writeFileSync(join(tempDir, ".env"), "");
    writeFileSync(join(tempDir, ".env.local"), "LOCAL_ONLY_KEY=abc\n");
    writeFileSync(join(tempDir, ".env.example"), "LOCAL_ONLY_KEY=\n");

    const result = auditEnv({ rootDir: tempDir });
    expect(result.missingInEnv).toEqual([]);
    expect(result.missingInExample).toEqual([]);
  });

  it("flags sensitive public prefixes accurately without false positives", () => {
    expect(detectSecretExposure("VITE_JWT_SECRET")).toEqual({
      prefix: "VITE_",
      matchedKeyword: "SECRET",
    });
    expect(detectSecretExposure("NEXT_PUBLIC_APP_URL")).toBeNull();
    expect(detectSecretExposure("JWT_SECRET")).toBeNull();
  });
});
