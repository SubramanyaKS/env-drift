import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { auditEnv } from "./analyzer.js";
import { loadConfig } from "./config.js";
import { syncEnvExample } from "./envParser.js";
import {
  formatAuditReport,
  formatGitHubAnnotations,
  hasBlockingIssues,
} from "./reporter.js";
import { writeEnvTypes } from "./typegen.js";

const VERSION = pkg.version;

const HELP_TEXT = `
${pc.bold(pc.cyan("@subramanyaks/env-drift"))} v${VERSION} — Detect environment variable drift and public secret leaks

${pc.bold("Usage:")}
  npx @subramanyaks/env-drift [options]

${pc.bold("Options:")}
  -d, --dir <path>          Project directory to scan (default: ".")
      --env <file>          Local env file name (default: ".env")
      --example <file>      Example env file name (default: ".env.example")
      --ignore <vars>       Comma-separated env var names to ignore
      --sync                Safely append missing keys to .env.example as KEY=
      --types               Generate env.d.ts for detected env variables
      --types-out <path>    Output path for --types (default: "env.d.ts")
      --ci                  Exit with code 1 if missing vars or secret leaks are found
      --format <type>       Output format: text, json, or github (default: "text")
      --json                Output audit results as JSON (alias for --format json)
  -v, --version             Show version
  -h, --help                Show this help message
`;

export function runCli(argv: string[] = process.argv.slice(2)): number {
  let values: Record<string, string | boolean | undefined>;

  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        dir: { type: "string", short: "d" },
        env: { type: "string" },
        example: { type: "string" },
        ignore: { type: "string" },
        sync: { type: "boolean", default: false },
        types: { type: "boolean", default: false },
        "types-out": { type: "string" },
        ci: { type: "boolean", default: false },
        format: { type: "string" },
        json: { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Error: ${msg}`));
    console.error(pc.dim("Run `env-drift --help` for usage."));
    return 1;
  }

  if (values.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const format = values.json
    ? "json"
    : typeof values.format === "string"
      ? values.format.toLowerCase()
      : "text";

  if (format !== "text" && format !== "json" && format !== "github") {
    console.error(
      pc.red(`Error: Invalid --format "${format}". Expected "text", "json", or "github".`)
    );
    return 1;
  }

  const rootDir = resolve(typeof values.dir === "string" ? values.dir : process.cwd());

  let fileConfig;
  try {
    fileConfig = loadConfig(rootDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Error: ${msg}`));
    return 1;
  }

  const envFile =
    typeof values.env === "string" ? values.env : fileConfig.envFile;
  const exampleFile =
    typeof values.example === "string"
      ? values.example
      : (fileConfig.exampleFile ?? ".env.example");

  const cliIgnore =
    typeof values.ignore === "string"
      ? values.ignore
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const mergedIgnore = [...(fileConfig.ignore ?? []), ...cliIgnore];

  const result = auditEnv({
    rootDir,
    envFile,
    exampleFile,
    ignore: mergedIgnore.length > 0 ? mergedIgnore : undefined,
    ignoreDirs: fileConfig.ignoreDirs,
    publicPrefixes: fileConfig.publicPrefixes,
    sensitiveKeywords: fileConfig.sensitiveKeywords,
  });

  if (values.sync && result.missingInExample.length > 0) {
    const examplePath = resolve(rootDir, exampleFile);
    const synced = syncEnvExample(examplePath, result.missingInExample);
    if (synced.added.length > 0) {
      const addedSet = new Set(synced.added);
      result.missingInExample = result.missingInExample.filter((k) => !addedSet.has(k));
      result.exampleFileExists = true;
      if (format === "text") {
        const action = synced.created ? "Created" : "Updated";
        console.log(
          pc.green(`✔ ${action} ${exampleFile} with ${synced.added.length} key(s): ${synced.added.join(", ")}`)
        );
      }
    }
  }

  if (values.types || typeof values["types-out"] === "string") {
    const outFile =
      typeof values["types-out"] === "string" ? values["types-out"] : "env.d.ts";
    const outputPath = resolve(rootDir, outFile);
    const generated = writeEnvTypes(outputPath, result);
    if (format === "text") {
      console.log(pc.green(`✔ Generated ${outFile} (${generated.count} env var(s))`));
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (format === "github") {
    const annotations = formatGitHubAnnotations(result, {
      envFile: envFile ?? ".env",
      exampleFile,
      ci: Boolean(values.ci),
    });
    if (annotations) {
      console.log(annotations);
    }
  } else {
    console.log(
      formatAuditReport(result, {
        envFile: envFile ?? ".env",
        exampleFile,
        ci: Boolean(values.ci),
      })
    );
  }

  if (values.ci && hasBlockingIssues(result)) {
    return 1;
  }

  return 0;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return (
      entry.endsWith("cli.js") ||
      entry.endsWith("env-drift") ||
      entry.endsWith("env-drift-cli")
    );
  }
}

if (isDirectExecution()) {
  process.exitCode = runCli();
}
