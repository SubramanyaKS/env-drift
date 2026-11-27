import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditEnv, detectExampleSecretLeak, detectSecretExposure } from "../src/analyzer.js";

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

  it("tracks envFileExists and exampleFileExists accurately", () => {
    writeFileSync(join(tempDir, "src", "app.ts"), "export const k = process.env.API_KEY;\n");

    const none = auditEnv({ rootDir: tempDir });
    expect(none.envFileExists).toBe(false);
    expect(none.exampleFileExists).toBe(false);

    writeFileSync(join(tempDir, ".env.local"), "API_KEY=123\n");
    writeFileSync(join(tempDir, ".env.example"), "API_KEY=\n");

    const localOnly = auditEnv({ rootDir: tempDir });
    expect(localOnly.envFileExists).toBe(true);
    expect(localOnly.exampleFileExists).toBe(true);
  });

  it("detects empty values in .env and respects .env.local overrides", () => {
    writeFileSync(
      join(tempDir, "src", "app.ts"),
      `
const a = process.env.EMPTY_KEY;
const b = process.env.OVERRIDDEN_KEY;
const c = process.env.SET_KEY;
`
    );
    writeFileSync(
      join(tempDir, ".env"),
      `EMPTY_KEY=
OVERRIDDEN_KEY=
SET_KEY=hello
`
    );
    writeFileSync(join(tempDir, ".env.local"), "OVERRIDDEN_KEY=populated\n");
    writeFileSync(
      join(tempDir, ".env.example"),
      "EMPTY_KEY=\nOVERRIDDEN_KEY=\nSET_KEY=\n"
    );

    const result = auditEnv({ rootDir: tempDir });
    expect(result.emptyInEnv).toEqual(["EMPTY_KEY"]);
  });

  it("detects real secrets accidentally committed in .env.example while ignoring placeholders", () => {
    expect(detectExampleSecretLeak("STRIPE_KEY", "sk_live_1234567890abcdef1234")).toBe(
      "Stripe live secret key"
    );
    expect(detectExampleSecretLeak("GITHUB_TOKEN", "ghp_1234567890abcdefghij123456")).toBe(
      "GitHub access token"
    );
    expect(detectExampleSecretLeak("AWS_KEY", "AKIAIOSFODNN7EXAMPLE")).toBe(
      "AWS Access Key ID"
    );
    expect(
      detectExampleSecretLeak(
        "DATABASE_URL",
        "postgres://admin:S3cur3Pr0dPass99@db.example.com:5432/prod"
      )
    ).toBe("Connection URL with embedded password");

    // Placeholders and empty values should not be flagged
    expect(detectExampleSecretLeak("STRIPE_KEY", "")).toBeNull();
    expect(detectExampleSecretLeak("STRIPE_KEY", "your_stripe_key_here")).toBeNull();
    expect(detectExampleSecretLeak("STRIPE_KEY", "changeme")).toBeNull();
    expect(
      detectExampleSecretLeak("DATABASE_URL", "postgres://postgres:password@localhost:5432/dev")
    ).toBeNull();
  });

  it("supports custom ignoreDirs, publicPrefixes, and sensitiveKeywords", () => {
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "generated", "client.ts"),
      "export const x = process.env.IGNORED_GEN_KEY;\n"
    );
    writeFileSync(
      join(tempDir, "src", "app.ts"),
      "export const y = process.env.CUSTOM_PUBLIC_MASTER_KEY;\n"
    );
    writeFileSync(join(tempDir, ".env.example"), "CUSTOM_PUBLIC_MASTER_KEY=\n");

    const result = auditEnv({
      rootDir: tempDir,
      ignoreDirs: ["generated"],
      publicPrefixes: ["CUSTOM_PUBLIC_"],
      sensitiveKeywords: ["MASTER_KEY"],
    });

    expect(result.usedInCode).not.toHaveProperty("IGNORED_GEN_KEY");
    expect(result.secretExposures).toHaveLength(1);
    expect(result.secretExposures[0]?.name).toBe("CUSTOM_PUBLIC_MASTER_KEY");
  });
});
