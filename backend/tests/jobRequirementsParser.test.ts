import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { parseCategorizedRequirements } from "../src/services/jobRequirementsParser.js";

const mockedChat = vi.mocked(chatCompletion);

const MOCK_RESPONSE = JSON.stringify({
  company_name: "Acme Corp",
  role_title: "Backend Engineer",
  location: "Toronto, ON",
  keywords: ["Node.js", "PostgreSQL"],
  categorized_requirements: [
    { text: "3+ years backend development", category: "experience" },
    { text: "Docker", category: "technologies" },
    { text: "AWS", category: "technologies" },
    { text: "Bachelor's degree in Computer Science", category: "education" },
    { text: "Strong communication skills", category: "skills" },
    { text: "invalid entry", category: "not-a-real-category" },
  ],
});

describe("parseCategorizedRequirements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns categorized requirements with valid categories only", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_RESPONSE);

    const result = await parseCategorizedRequirements("some job posting text");

    expect(result.company_name).toBe("Acme Corp");
    expect(result.role_title).toBe("Backend Engineer");
    expect(result.categorized_requirements).toHaveLength(5);
    expect(result.categorized_requirements.map((r) => r.category)).not.toContain(
      "not-a-real-category"
    );
    expect(result.requirements).toEqual(
      result.categorized_requirements.map((r) => r.text)
    );
  });

  it("falls back to safe defaults when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await parseCategorizedRequirements("some job posting text");

    expect(result.company_name).toBe("Unknown");
    expect(result.categorized_requirements).toEqual([]);
  });
});
