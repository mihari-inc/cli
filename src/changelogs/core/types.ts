export interface ChangelogPayload {
  version: string;
  previousVersion: string | null;
  date: string;
  markdown: string;
  repository: string | null;
  commitCount: number;
}
