import type { CandidateProfile, MatchAnalysisResponse } from "../types/index.js";
import { parseCategorizedRequirements } from "./jobRequirementsParser.js";
import { computeCoverage } from "./coverageMatcher.js";
import { generateMatchNarrative } from "./matchNarrative.js";

/**
 * Full match analysis pipeline: categorize job requirements, compute
 * deterministic coverage against the profile, then generate the LLM
 * narrative grounded in that coverage.
 */
export async function analyzeMatch(
  profile: CandidateProfile,
  jobPosting: string
): Promise<MatchAnalysisResponse> {
  const categorizedJob = await parseCategorizedRequirements(jobPosting);
  const coverage = computeCoverage(profile, categorizedJob.categorized_requirements);
  const narrative = await generateMatchNarrative(profile, coverage);

  return {
    parsed_job: {
      company_name: categorizedJob.company_name,
      role_title: categorizedJob.role_title,
      location: categorizedJob.location,
      requirements: categorizedJob.requirements,
      keywords: categorizedJob.keywords,
    },
    overall_score: coverage.overall_score,
    category_scores: coverage.category_scores,
    matched_requirements: coverage.matched_requirements,
    missing_requirements: coverage.missing_requirements,
    critical_missing_skills: narrative.critical_missing_skills,
    strengths: narrative.strengths,
    weaknesses: narrative.weaknesses,
    estimated_ranking_band: narrative.estimated_ranking_band,
  };
}
