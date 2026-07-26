import { describe, it, expect } from "vitest";
import { computeCoverage } from "../src/services/coverageMatcher.js";
import type { CandidateProfile, CategorizedRequirement } from "../src/types/index.js";

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "React", "SQL", "Docker"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Built and maintained microservices for a fintech platform.",
      outcomes: ["Reduced API latency by 30%"],
    },
  ],
  projects: [],
  programme: "Computer Science",
  university: "University of Toronto",
};

const REQUIREMENTS: CategorizedRequirement[] = [
  { text: "Python", category: "technologies" },
  { text: "AWS", category: "technologies" },
  { text: "3+ years backend development experience", category: "experience" },
  { text: "Bachelor's degree in Computer Science", category: "education" },
  { text: "Strong communication skills", category: "skills" },
];

describe("computeCoverage", () => {
  it("matches requirements found in the profile", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);

    expect(result.matched_requirements).toContain("Python");
    expect(result.matched_requirements).toContain("Bachelor's degree in Computer Science");
    expect(result.missing_requirements).toContain("AWS");
  });

  it("computes per-category scores as a percentage", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);

    expect(result.category_scores.technologies).toBe(50); // 1 of 2 matched (Python yes, AWS no)
    expect(result.category_scores.education).toBe(100); // 1 of 1 matched
  });

  it("computes overall_score as matched/total requirements", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);
    const expectedMatchedCount =
      result.matched_requirements.length;

    expect(result.overall_score).toBe(
      Math.round((expectedMatchedCount / REQUIREMENTS.length) * 100)
    );
  });

  it("returns zero scores when there are no requirements", () => {
    const result = computeCoverage(PROFILE, []);

    expect(result.overall_score).toBe(0);
    expect(result.matched_requirements).toEqual([]);
    expect(result.missing_requirements).toEqual([]);
  });

  it("returns a category score of 0 for categories with no requirements", () => {
    const result = computeCoverage(PROFILE, [
      { text: "Python", category: "technologies" },
    ]);

    expect(result.category_scores.skills).toBe(0);
    expect(result.category_scores.experience).toBe(0);
  });
});
