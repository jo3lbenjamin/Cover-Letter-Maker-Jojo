import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { generateMatchNarrative } from "../src/services/matchNarrative.js";
import type { CandidateProfile, CoverageResult } from "../src/types/index.js";

const mockedChat = vi.mocked(chatCompletion);

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "React", "SQL"],
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

const COVERAGE: CoverageResult = {
  matched_requirements: ["Python", "SQL"],
  missing_requirements: ["Docker", "AWS"],
  category_scores: { skills: 100, experience: 50, keywords: 60, education: 0, technologies: 30 },
  overall_score: 62,
};

const MOCK_RESPONSE = JSON.stringify({
  strengths: ["Strong Python and SQL background", "Relevant fintech experience"],
  weaknesses: ["Bullet points lack measurable outcomes"],
  critical_missing_skills: ["Docker", "AWS"],
  estimated_ranking_band: "Strong candidate (Top 20-30%)",
});

describe("generateMatchNarrative", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns strengths, weaknesses, and ranking band from the LLM", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_RESPONSE);

    const result = await generateMatchNarrative(PROFILE, COVERAGE);

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses).toContain("Bullet points lack measurable outcomes");
    expect(result.critical_missing_skills).toEqual(["Docker", "AWS"]);
    expect(result.estimated_ranking_band).toBe("Strong candidate (Top 20-30%)");
  });

  it("falls back to safe defaults when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await generateMatchNarrative(PROFILE, COVERAGE);

    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.critical_missing_skills).toEqual([]);
    expect(result.estimated_ranking_band).toBe("Unable to estimate");
  });
});
