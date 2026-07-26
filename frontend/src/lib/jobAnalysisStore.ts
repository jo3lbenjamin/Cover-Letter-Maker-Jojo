import type { JobAnalysisRecord } from "@/types/jobFit";

const STORAGE_KEY = "covercraft-job-analyses";
const MAX_ANALYSES = 50;

export interface JobAnalysisStore {
  list(): JobAnalysisRecord[];
  get(id: string): JobAnalysisRecord | undefined;
  listForResume(resumeId: string): JobAnalysisRecord[];
  save(analysis: JobAnalysisRecord): void;
}

class LocalStorageJobAnalysisStore implements JobAnalysisStore {
  list(): JobAnalysisRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  get(id: string): JobAnalysisRecord | undefined {
    return this.list().find((a) => a.id === id);
  }

  listForResume(resumeId: string): JobAnalysisRecord[] {
    return this.list().filter((a) => a.resume_id === resumeId);
  }

  save(analysis: JobAnalysisRecord): void {
    const analyses = this.list().filter((a) => a.id !== analysis.id);
    analyses.unshift(analysis);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analyses.slice(0, MAX_ANALYSES)));
  }
}

export const jobAnalysisStore: JobAnalysisStore = new LocalStorageJobAnalysisStore();
