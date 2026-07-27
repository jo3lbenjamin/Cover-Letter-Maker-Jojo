import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { analyzeMatch } from "../src/services/matchAnalyzer.js";
import type { CandidateProfile } from "../src/types/index.js";

const mockedChat = vi.mocked(chatCompletion);

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "SQL"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Built microservices for a fintech platform.",
    },
  ],
  projects: [],
};

const MOCK_CATEGORIZED_JOB = JSON.stringify({
  company_name: "Acme Corp",
  role_title: "Backend Engineer",
  location: "Toronto, ON",
  keywords: ["Python", "fintech"],
  categorized_requirements: [
    { text: "Python", category: "technologies" },
    { text: "Docker", category: "technologies" },
  ],
});

const MOCK_NARRATIVE = JSON.stringify({
  strengths: ["Strong Python background"],
  weaknesses: ["Bullet points lack measurable outcomes"],
  critical_missing_skills: ["Docker"],
  estimated_ranking_band: "Competitive",
});

describe("analyzeMatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("combines Stage 1 coverage with Stage 2 narrative into one response", async () => {
    mockedChat
      .mockResolvedValueOnce(MOCK_CATEGORIZED_JOB)
      .mockResolvedValueOnce(MOCK_NARRATIVE);

    const result = await analyzeMatch(PROFILE, "some job posting text");

    expect(result.parsed_job.company_name).toBe("Acme Corp");
    expect(result.matched_requirements).toContain("Python");
    expect(result.missing_requirements).toContain("Docker");
    expect(result.overall_score).toBe(50);
    expect(result.strengths).toEqual(["Strong Python background"]);
    expect(result.critical_missing_skills).toEqual(["Docker"]);
    expect(result.estimated_ranking_band).toBe("Competitive");
  });

  it("propagates a Stage 1 parsing failure instead of returning a fake 0% match", async () => {
    mockedChat.mockResolvedValueOnce("not json").mockResolvedValueOnce("still not json");

    await expect(analyzeMatch(PROFILE, "some job posting text")).rejects.toThrow();
  });
});
