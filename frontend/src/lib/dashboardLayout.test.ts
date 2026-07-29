import { describe, it, expect } from "vitest";
import { getDefaultExpandedSections } from "./dashboardLayout";

describe("getDefaultExpandedSections", () => {
  it("expands profile and job-match, collapses cover letter when profile is incomplete and no letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: false, hasCoverLetter: false });
    expect(result).toEqual(["profile", "jobMatch"]);
  });

  it("collapses profile, expands job-match, collapses cover letter when profile is complete and no letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: true, hasCoverLetter: false });
    expect(result).toEqual(["jobMatch"]);
  });

  it("collapses profile, expands job-match and cover letter when profile is complete and a letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: true, hasCoverLetter: true });
    expect(result).toEqual(["jobMatch", "coverLetter"]);
  });
});
