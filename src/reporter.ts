import pc from "picocolors";
import type { AuditResult, EnvReference } from "./types.js";

function formatRefs(refs: EnvReference[] | undefined): string {
  if (!refs || refs.length === 0) return "";
  const shown = refs.slice(0, 2).map((r) => `${r.file}:${r.line}`);
  const extra = refs.length > 2 ? ` (+${refs.length - 2} more)` : "";
  return pc.dim(` ← ${shown.join(", ")}${extra}`);
}

/**
 * Returns true if the audit found blocking issues (missing vars, exposed public secrets,
 * or real secrets committed in `.env.example`).
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
    result.secretExposures.length > 0 ||
    result.exampleSecretLeaks.length > 0
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
    result.exampleSecretLeaks.length +
    (skipMissingInEnv ? 0 : result.missingInEnv.length) +
    result.missingInExample.length +
    result.emptyInEnv.length +
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

  if (result.exampleSecretLeaks.length > 0) {
    lines.push(
      pc.bold(pc.red(`✖ Possible Real Secret in ${exampleFile} (${result.exampleSecretLeaks.length})`))
    );
    for (const item of result.exampleSecretLeaks) {
      lines.push(
        `  ${pc.red("•")} ${pc.bold(item.name)} ${pc.dim(
          `(${item.reason}) ← ${item.file}:${item.line}`
        )}`
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

  if (result.emptyInEnv.length > 0) {
    lines.push(pc.bold(pc.yellow(`⚠ Empty Value in ${envFile} (${result.emptyInEnv.length})`)));
    for (const key of result.emptyInEnv) {
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

function escapeGitHubData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeGitHubProperty(value: string): string {
  return escapeGitHubData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function buildAnnotation(
  level: "error" | "warning",
  title: string,
  message: string,
  file?: string,
  line?: number
): string {
  const props: string[] = [];
  if (file) props.push(`file=${escapeGitHubProperty(file)}`);
  if (line !== undefined) props.push(`line=${line}`);
  props.push(`title=${escapeGitHubProperty(title)}`);
  return `::${level} ${props.join(",")}::${escapeGitHubData(message)}`;
}

/**
 * Formats an AuditResult as GitHub Actions workflow commands (`::error` / `::warning`)
 * so findings render inline on Pull Request diffs.
 */
export function formatGitHubAnnotations(
  result: AuditResult,
  options: { envFile?: string; exampleFile?: string; ci?: boolean } = {}
): string {
  const envFile = options.envFile ?? ".env";
  const exampleFile = options.exampleFile ?? ".env.example";
  const skipMissingInEnv = Boolean(options.ci && !result.envFileExists);
  const lines: string[] = [];

  for (const item of result.secretExposures) {
    const firstRef = item.references[0];
    lines.push(
      buildAnnotation(
        "error",
        "Public Secret Exposure",
        `${item.name} uses client-exposed prefix "${item.prefix}" with sensitive keyword "${item.matchedKeyword}"`,
        firstRef?.file,
        firstRef?.line
      )
    );
  }

  for (const leak of result.exampleSecretLeaks) {
    lines.push(
      buildAnnotation(
        "error",
        `Secret Leak in ${exampleFile}`,
        `${leak.name} appears to contain a real secret (${leak.reason}). Replace it with an empty placeholder.`,
        leak.file,
        leak.line
      )
    );
  }

  if (!skipMissingInEnv) {
    for (const key of result.missingInEnv) {
      const firstRef = result.usedInCode[key]?.[0];
      lines.push(
        buildAnnotation(
          "error",
          `Missing in ${envFile}`,
          `Environment variable ${key} is referenced in code but missing in ${envFile}`,
          firstRef?.file,
          firstRef?.line
        )
      );
    }
  }

  for (const key of result.missingInExample) {
    const firstRef = result.usedInCode[key]?.[0];
    lines.push(
      buildAnnotation(
        "error",
        `Missing in ${exampleFile}`,
        `Environment variable ${key} is referenced in code but missing in ${exampleFile}. Run \`env-drift --sync\` to update.`,
        firstRef?.file,
        firstRef?.line
      )
    );
  }

  for (const key of result.emptyInEnv) {
    const firstRef = result.usedInCode[key]?.[0];
    lines.push(
      buildAnnotation(
        "warning",
        `Empty Value in ${envFile}`,
        `Environment variable ${key} is defined in ${envFile} with an empty value`,
        firstRef?.file,
        firstRef?.line
      )
    );
  }

  for (const key of result.unusedInEnv) {
    lines.push(
      buildAnnotation(
        "warning",
        `Unused in ${envFile}`,
        `Environment variable ${key} is defined in ${envFile} but not referenced in code`,
        envFile
      )
    );
  }

  for (const key of result.unusedInExample) {
    lines.push(
      buildAnnotation(
        "warning",
        `Unused in ${exampleFile}`,
        `Environment variable ${key} is defined in ${exampleFile} but not referenced in code`,
        exampleFile
      )
    );
  }

  for (const key of result.duplicateKeys.env) {
    lines.push(
      buildAnnotation(
        "warning",
        `Duplicate Key in ${envFile}`,
        `Environment variable ${key} is defined multiple times in ${envFile}`,
        envFile
      )
    );
  }

  for (const key of result.duplicateKeys.example) {
    lines.push(
      buildAnnotation(
        "warning",
        `Duplicate Key in ${exampleFile}`,
        `Environment variable ${key} is defined multiple times in ${exampleFile}`,
        exampleFile
      )
    );
  }

  return lines.join("\n");
}
