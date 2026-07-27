import { describe, it, expect, beforeEach } from "vitest";
import { resumeStore, MAX_RESUMES } from "./resumeStore";
import type { ResumeRecord } from "@/types/jobFit";
import { DEFAULT_PROFILE } from "./profile";

function makeResume(overrides?: Partial<ResumeRecord>): ResumeRecord {
  return {
    id: crypto.randomUUID(),
    name: "Test Resume",
    profile: { ...DEFAULT_PROFILE },
    raw_text: "Resume text",
    source: "upload",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("resumeStore", () => {
  beforeEach(() => localStorage.clear());

  it("saves and lists resumes, most recent first", () => {
    const first = makeResume({ name: "First" });
    const second = makeResume({ name: "Second" });
    resumeStore.save(first);
    resumeStore.save(second);

    const all = resumeStore.list();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Second");
  });

  it("gets a resume by id", () => {
    const resume = makeResume();
    resumeStore.save(resume);

    expect(resumeStore.get(resume.id)?.name).toBe("Test Resume");
    expect(resumeStore.get("nonexistent")).toBeUndefined();
  });

  it("removes a resume by id", () => {
    const resume = makeResume();
    resumeStore.save(resume);
    resumeStore.remove(resume.id);

    expect(resumeStore.get(resume.id)).toBeUndefined();
  });

  it("caps the library at MAX_RESUMES entries", () => {
    for (let i = 0; i < MAX_RESUMES + 5; i++) {
      resumeStore.save(makeResume({ name: `Resume ${i}` }));
    }

    expect(resumeStore.list()).toHaveLength(MAX_RESUMES);
  });
});
