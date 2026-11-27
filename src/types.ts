export interface EnvReference {
  name: string;
  file: string;
  line: number;
  source: "process.env" | "import.meta.env" | "Bun.env" | "Deno.env";
}

export interface ParsedEnvFile {
  filePath: string;
  exists: boolean;
  keys: string[];
  values: Record<string, string>;
  lines: Record<string, number>;
  duplicates: string[];
}

export interface SecretExposureWarning {
  name: string;
  prefix: string;
  matchedKeyword: string;
  references: EnvReference[];
}

export interface ExampleSecretLeak {
  name: string;
  reason: string;
  file: string;
  line: number;
}

export interface AuditResult {
  rootDir: string;
  scannedFiles: number;
  envFileExists: boolean;
  exampleFileExists: boolean;
  usedInCode: Record<string, EnvReference[]>;
  missingInEnv: string[];
  missingInExample: string[];
  emptyInEnv: string[];
  unusedInEnv: string[];
  unusedInExample: string[];
  secretExposures: SecretExposureWarning[];
  exampleSecretLeaks: ExampleSecretLeak[];
  duplicateKeys: {
    env: string[];
    example: string[];
  };
}

export interface EnvDriftConfig {
  envFile?: string;
  exampleFile?: string;
  ignore?: string[];
  ignoreDirs?: string[];
  publicPrefixes?: string[];
  sensitiveKeywords?: string[];
}

export interface AuditOptions extends EnvDriftConfig {
  rootDir?: string;
}
