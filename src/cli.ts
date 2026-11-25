import { resolve } from "node:path";
import { parseArgs } from "node:util";
import pc from "picocolors";
import { auditEnv } from "./analyzer.js";
import { syncEnvExample } from "./envParser.js";
import { formatAuditReport, hasBlockingIssues } from "./reporter.js";
import { writeEnvTypes } from "./typegen.js";

const VERSION = "1.0.0";

const HELP_TEXT = `
${pc.bold(pc.cyan("@subramanyaks/env-drift"))} v${VERSION} — Detect environment variable drift and public secret leaks

${pc.bold("Usage:")}
  npx @subramanyaks/env-drift [options]

${pc.bold("Options:")}
  -d, --dir <path>        Project directory to scan (default: ".")
      --env <file>        Local env file name (default: ".env")
      --example <file>    Example env file name (default: ".env.example")
      --ignore <vars>     Comma-separated env var names to ignore
      --sync              Safely append missing keys to .env.example as KEY=
      --types             Generate env.d.ts for detected env variables
      --types-out <path>  Output path for --types (default: "env.d.ts")
      --ci                Exit with code 1 if missing vars or secret leaks are found
      --json              Output audit results as JSON
  -v, --version           Show version
  -h, --help              Show this help message
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

  const rootDir = resolve(typeof values.dir === "string" ? values.dir : process.cwd());
  const envFile = typeof values.env === "string" ? values.env : undefined;
  const exampleFile = typeof values.example === "string" ? values.example : ".env.example";
  const ignore =
    typeof values.ignore === "string"
      ? values.ignore
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const result = auditEnv({
    rootDir,
    envFile,
    exampleFile,
    ignore,
  });

  if (values.sync && result.missingInExample.length > 0) {
    const examplePath = resolve(rootDir, exampleFile);
    const synced = syncEnvExample(examplePath, result.missingInExample);
    if (!values.json && synced.added.length > 0) {
      const action = synced.created ? "Created" : "Updated";
      console.log(
        pc.green(`✔ ${action} ${exampleFile} with ${synced.added.length} key(s): ${synced.added.join(", ")}`)
      );
    }
  }

  if (values.types || typeof values["types-out"] === "string") {
    const outFile =
      typeof values["types-out"] === "string" ? values["types-out"] : "env.d.ts";
    const outputPath = resolve(rootDir, outFile);
    const generated = writeEnvTypes(outputPath, result);
    if (!values.json) {
      console.log(pc.green(`✔ Generated ${outFile} (${generated.count} env var(s))`));
    }
  }

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      formatAuditReport(result, {
        envFile: envFile ?? ".env",
        exampleFile,
      })
    );
  }

  if (values.ci && hasBlockingIssues(result)) {
    return 1;
  }

  return 0;
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("env-drift") ||
    process.argv[1].endsWith("env-drift-cli"));

if (isDirectExecution) {
  process.exitCode = runCli();
}
