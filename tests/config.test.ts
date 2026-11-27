import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-drift-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty object when no config file exists", () => {
    expect(loadConfig(tempDir)).toEqual({});
  });

  it("loads .envdriftrc.json when present", () => {
    writeFileSync(
      join(tempDir, ".envdriftrc.json"),
      JSON.stringify({
        envFile: ".env.dev",
        exampleFile: ".env.sample",
        ignore: ["VERCEL_URL"],
        ignoreDirs: ["generated"],
        publicPrefixes: ["CUSTOM_PUBLIC_"],
        sensitiveKeywords: ["MASTER_KEY"],
      })
    );

    expect(loadConfig(tempDir)).toEqual({
      envFile: ".env.dev",
      exampleFile: ".env.sample",
      ignore: ["VERCEL_URL"],
      ignoreDirs: ["generated"],
      publicPrefixes: ["CUSTOM_PUBLIC_"],
      sensitiveKeywords: ["MASTER_KEY"],
    });
  });

  it("falls back to package.json env-drift field", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "demo",
        "env-drift": {
          ignore: ["RAILWAY_ENV"],
          ignoreDirs: ["storybook-static"],
        },
      })
    );

    expect(loadConfig(tempDir)).toEqual({
      ignore: ["RAILWAY_ENV"],
      ignoreDirs: ["storybook-static"],
    });
  });

  it("throws a helpful error on malformed .envdriftrc.json", () => {
    writeFileSync(join(tempDir, ".envdriftrc.json"), "{ invalid json");
    expect(() => loadConfig(tempDir)).toThrow(/Failed to parse \.envdriftrc\.json/);
  });
});
