import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { optimizeResume } from "../src/services/resumeOptimizer.js";
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
      description: "Worked on backend services.",
      outcomes: [],
    },
  ],
  projects: [],
};

const MOCK_OPTIMIZED = JSON.stringify({
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(416) 555 0199",
  location: "Toronto, Ontario",
  skills: ["Python", "SQL", "Backend Development"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      end_date: "",
      description: "Built and maintained backend services handling production traffic.",
      outcomes: [],
    },
  ],
  projects: [],
});

describe("optimizeResume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an updated profile from the LLM response", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_OPTIMIZED);

    const result = await optimizeResume(PROFILE, {
      matched_requirements: ["Python"],
      missing_requirements: ["Docker"],
      critical_missing_skills: ["Docker"],
      weaknesses: ["Descriptions are too generic"],
    });

    expect(result.name).toBe("Jane Doe");
    expect(result.experiences[0].description).toContain("production traffic");
  });

  it("falls back to the original profile when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await optimizeResume(PROFILE, {
      matched_requirements: [],
      missing_requirements: [],
      critical_missing_skills: [],
      weaknesses: [],
    });

    expect(result).toEqual(PROFILE);
  });
});
