export interface EnvReference {
  name: string;
  file: string;
  line: number;
  source: "process.env" | "import.meta.env";
}

export interface ParsedEnvFile {
  filePath: string;
  exists: boolean;
  keys: string[];
  values: Record<string, string>;
  duplicates: string[];
}

export interface SecretExposureWarning {
  name: string;
  prefix: string;
  matchedKeyword: string;
  references: EnvReference[];
}

export interface AuditResult {
  rootDir: string;
  scannedFiles: number;
  usedInCode: Record<string, EnvReference[]>;
  missingInEnv: string[];
  missingInExample: string[];
  unusedInEnv: string[];
  unusedInExample: string[];
  secretExposures: SecretExposureWarning[];
  duplicateKeys: {
    env: string[];
    example: string[];
  };
}

export interface AuditOptions {
  rootDir?: string;
  envFile?: string;
  exampleFile?: string;
  ignore?: string[];
}
