import pc from "picocolors";
import type { AuditResult, EnvReference } from "./types.js";

function formatRefs(refs: EnvReference[] | undefined): string {
  if (!refs || refs.length === 0) return "";
  const shown = refs.slice(0, 2).map((r) => `${r.file}:${r.line}`);
  const extra = refs.length > 2 ? ` (+${refs.length - 2} more)` : "";
  return pc.dim(` ← ${shown.join(", ")}${extra}`);
}

/**
 * Returns true if the audit found blocking issues (missing vars or exposed public secrets).
 * When no local `.env` file exists (e.g. in CI where `.env` is gitignored), `missingInEnv`
 * is skipped by default unless `requireEnvFile` is true.
 */
export function hasBlockingIssues(
  result: AuditResult,
  options: { requireEnvFile?: boolean } = {}
): boolean {
  const checkMissingInEnv = options.requireEnvFile ? true : result.envFileExists;
  return (
    (checkMissingInEnv && result.missingInEnv.length > 0) ||
    result.missingInExample.length > 0 ||
    result.secretExposures.length > 0
  );
}

/**
 * Formats an AuditResult into a colorized terminal report.
 */
export function formatAuditReport(
  result: AuditResult,
  options: { envFile?: string; exampleFile?: string; ci?: boolean } = {}
): string {
  const envFile = options.envFile ?? ".env";
  const exampleFile = options.exampleFile ?? ".env.example";
  const skipMissingInEnv = Boolean(options.ci && !result.envFileExists);
  const lines: string[] = [];

  lines.push("");
  lines.push(
    `${pc.bold(pc.cyan("env-drift"))} ${pc.dim(
      `— scanned ${result.scannedFiles} file${result.scannedFiles === 1 ? "" : "s"}`
    )}`
  );
  lines.push("");

  const totalIssues =
    result.secretExposures.length +
    (skipMissingInEnv ? 0 : result.missingInEnv.length) +
    result.missingInExample.length +
    result.unusedInEnv.length +
    result.unusedInExample.length +
    result.duplicateKeys.env.length +
    result.duplicateKeys.example.length;

  if (totalIssues === 0) {
    lines.push(pc.green("✔ No environment drift detected. Everything is in sync!"));
    if (skipMissingInEnv && result.missingInEnv.length > 0) {
      lines.push(
        pc.dim(`  (No ${envFile} file found — skipped local ${envFile} check in CI mode)`)
      );
    }
    lines.push("");
    return lines.join("\n");
  }

  if (result.secretExposures.length > 0) {
    lines.push(pc.bold(pc.red(`✖ Possible Public Secret Exposure (${result.secretExposures.length})`)));
    for (const item of result.secretExposures) {
      lines.push(
        `  ${pc.red("•")} ${pc.bold(item.name)} ${pc.dim(
          `(public prefix "${item.prefix}" + sensitive "${item.matchedKeyword}")`
        )}${formatRefs(item.references)}`
      );
    }
    lines.push("");
  }

  if (!skipMissingInEnv && result.missingInEnv.length > 0) {
    lines.push(pc.bold(pc.red(`✖ Missing in ${envFile} (${result.missingInEnv.length})`)));
    for (const key of result.missingInEnv) {
      lines.push(`  ${pc.red("•")} ${key}${formatRefs(result.usedInCode[key])}`);
    }
    lines.push("");
  } else if (skipMissingInEnv && result.missingInEnv.length > 0) {
    lines.push(
      pc.dim(`ℹ No ${envFile} file found — skipped local ${envFile} check in CI mode`)
    );
    lines.push("");
  }

  if (result.missingInExample.length > 0) {
    lines.push(pc.bold(pc.yellow(`⚠ Missing in ${exampleFile} (${result.missingInExample.length})`)));
    for (const key of result.missingInExample) {
      lines.push(`  ${pc.yellow("•")} ${key}${formatRefs(result.usedInCode[key])}`);
    }
    lines.push("");
  }

  if (result.unusedInEnv.length > 0) {
    lines.push(pc.bold(pc.cyan(`○ Unused in ${envFile} (${result.unusedInEnv.length})`)));
    for (const key of result.unusedInEnv) {
      lines.push(`  ${pc.dim("•")} ${key}`);
    }
    lines.push("");
  }

  if (result.unusedInExample.length > 0) {
    lines.push(pc.bold(pc.cyan(`○ Unused in ${exampleFile} (${result.unusedInExample.length})`)));
    for (const key of result.unusedInExample) {
      lines.push(`  ${pc.dim("•")} ${key}`);
    }
    lines.push("");
  }

  if (result.duplicateKeys.env.length > 0 || result.duplicateKeys.example.length > 0) {
    lines.push(pc.bold(pc.yellow("⚠ Duplicate Keys")));
    for (const key of result.duplicateKeys.env) {
      lines.push(`  ${pc.yellow("•")} ${key} ${pc.dim(`in ${envFile}`)}`);
    }
    for (const key of result.duplicateKeys.example) {
      lines.push(`  ${pc.yellow("•")} ${key} ${pc.dim(`in ${exampleFile}`)}`);
    }
    lines.push("");
  }

  if (result.missingInExample.length > 0) {
    lines.push(
      pc.dim(`Tip: Run with ${pc.white("--sync")} to safely append missing keys to ${exampleFile}.`)
    );
    lines.push("");
  }

  return lines.join("\n");
}
