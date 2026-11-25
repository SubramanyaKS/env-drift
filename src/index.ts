export {
  auditEnv,
  detectSecretExposure,
  BUILTIN_ENV_VARS,
  PUBLIC_ENV_PREFIXES,
  SENSITIVE_KEYWORDS,
} from "./analyzer.js";
export { parseEnvContent, parseEnvFile, syncEnvExample } from "./envParser.js";
export {
  extractEnvReferences,
  scanFiles,
  DEFAULT_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
} from "./scanner.js";
export { generateEnvTypes, writeEnvTypes } from "./typegen.js";
export { formatAuditReport, hasBlockingIssues } from "./reporter.js";
export type {
  AuditOptions,
  AuditResult,
  EnvReference,
  ParsedEnvFile,
  SecretExposureWarning,
} from "./types.js";
