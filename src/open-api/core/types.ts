import type { Issue, OpenApiMajorVersion, Severity } from "@mihari/oas";

export type { Issue, OpenApiMajorVersion, Severity };

export interface FileResult {
  file: string;
  version: OpenApiMajorVersion | null;
  issues: Issue[];
  errorCount: number;
  warningCount: number;
}

export interface ValidationSummary {
  files: FileResult[];
  totalErrors: number;
  totalWarnings: number;
}
