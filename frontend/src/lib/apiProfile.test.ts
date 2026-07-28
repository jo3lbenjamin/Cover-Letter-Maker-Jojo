import { describe, it, expect } from "vitest";
import { toApiCandidateProfile } from "./apiProfile";
import { DEFAULT_PROFILE } from "./profile";
import type { CandidateProfile } from "@/types/profile";

function makeProfile(overrides?: Partial<CandidateProfile>): CandidateProfile {
  return {
    ...DEFAULT_PROFILE,
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    location: "Toronto, ON",
    skills: ["React", "TypeScript"],
    experiences: [
      {
        id: "exp-1",
        title: "Engineer",
        company: "Acme",
        start_date: "2024",
        end_date: "2025",
        description: "Built things.",
        outcomes: ["Shipped a thing"],
      },
    ],
    projects: [
      { id: "proj-1", name: "Side Project", description: "A project", technologies: ["Vite"], outcomes: [] },
    ],
    education: [
      { id: "edu-1", programme: "BSc CS", university: "U of T", degree_year: "2026" },
    ],
    ...overrides,
  };
}

describe("toApiCandidateProfile", () => {
  it("strips client-only ids from experiences and projects", () => {
    const result = toApiCandidateProfile(makeProfile());

    expect(result.experiences[0]).not.toHaveProperty("id");
    expect(result.projects?.[0]).not.toHaveProperty("id");
    expect(result.experiences[0].title).toBe("Engineer");
  });

  it("flattens the primary education entry into top-level fields", () => {
    const result = toApiCandidateProfile(makeProfile());

    expect(result.programme).toBe("BSc CS");
    expect(result.university).toBe("U of T");
    expect(result.degree_year).toBe("2026");
  });

  it("omits education fields entirely when there is no education", () => {
    const result = toApiCandidateProfile(makeProfile({ education: [] }));

    expect(result.programme).toBeUndefined();
    expect(result.university).toBeUndefined();
    expect(result.degree_year).toBeUndefined();
  });
});
