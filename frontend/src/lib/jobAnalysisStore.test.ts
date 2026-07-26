import { describe, it, expect, beforeEach } from "vitest";
import { jobAnalysisStore } from "./jobAnalysisStore";
import type { JobAnalysisRecord } from "@/types/jobFit";

function makeAnalysis(overrides?: Partial<JobAnalysisRecord>): JobAnalysisRecord {
  return {
    id: crypto.randomUUID(),
    resume_id: "resume-1",
    job_posting_text: "Backend Engineer role",
    parsed_job: {
      company_name: "Acme",
      role_title: "Backend Engineer",
      location: "Toronto",
      requirements: [],
      keywords: [],
    },
    overall_score: 80,
    category_scores: { skills: 80, experience: 80, keywords: 80, education: 80, technologies: 80 },
    matched_requirements: [],
    missing_requirements: [],
    critical_missing_skills: [],
    strengths: [],
    weaknesses: [],
    estimated_ranking_band: "Competitive",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("jobAnalysisStore", () => {
  beforeEach(() => localStorage.clear());

  it("saves and lists analyses, most recent first", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1" }));
    jobAnalysisStore.save(makeAnalysis({ id: "a2" }));

    const all = jobAnalysisStore.list();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe("a2");
  });

  it("gets an analysis by id", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1" }));
    expect(jobAnalysisStore.get("a1")?.id).toBe("a1");
  });

  it("filters analyses by resume id", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1", resume_id: "resume-1" }));
    jobAnalysisStore.save(makeAnalysis({ id: "a2", resume_id: "resume-2" }));

    const forResume1 = jobAnalysisStore.listForResume("resume-1");
    expect(forResume1).toHaveLength(1);
    expect(forResume1[0].id).toBe("a1");
  });
});
