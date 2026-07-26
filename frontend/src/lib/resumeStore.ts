import type { ResumeRecord } from "@/types/jobFit";

const STORAGE_KEY = "covercraft-resumes";
export const MAX_RESUMES = 20;

export interface ResumeStore {
  list(): ResumeRecord[];
  get(id: string): ResumeRecord | undefined;
  save(resume: ResumeRecord): void;
  remove(id: string): void;
}

class LocalStorageResumeStore implements ResumeStore {
  list(): ResumeRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  get(id: string): ResumeRecord | undefined {
    return this.list().find((r) => r.id === id);
  }

  save(resume: ResumeRecord): void {
    const resumes = this.list().filter((r) => r.id !== resume.id);
    resumes.unshift(resume);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resumes.slice(0, MAX_RESUMES)));
  }

  remove(id: string): void {
    const resumes = this.list().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resumes));
  }
}

export const resumeStore: ResumeStore = new LocalStorageResumeStore();
