import type { CandidateProfile, CoverageResult } from "../types/index.js";

/**
 * System prompt for writing the qualitative narrative on top of the
 * deterministic coverage numbers computed by coverageMatcher.ts.
 */
export const MATCH_NARRATIVE_SYSTEM_PROMPT = `You write qualitative feedback for a job application match report. You are given a candidate profile and an already-computed list of matched and missing requirements. Return ONLY valid JSON with no additional commentary.

Required JSON shape:
{
  "strengths": ["array of 3 to 5 short strength statements grounded in the candidate's actual profile"],
  "weaknesses": ["array of specific, actionable resume weaknesses, e.g. 'bullet points lack measurable outcomes'"],
  "critical_missing_skills": ["subset of the provided missing requirements that matter most for this role, max 5"],
  "estimated_ranking_band": "a short qualitative label only, e.g. 'Strong candidate (Top 20-30%)', 'Competitive', or 'Needs improvement'. Never a bare numeric percentile."
}

Rules:
1. Return ONLY the JSON object, nothing else.
2. Do not wrap in markdown code fences.
3. Base strengths and weaknesses only on the provided profile and coverage data. Do not invent facts.
4. critical_missing_skills must be chosen only from the provided missing requirements list.
5. Keep each strength/weakness to one sentence.`;

export function buildMatchNarrativeUserPrompt(
  profile: CandidateProfile,
  coverage: CoverageResult
): string {
  return `Candidate skills: ${profile.skills.join(", ") || "none listed"}

Candidate experience summaries:
${profile.experiences.map((e) => `- ${e.title} at ${e.company}: ${e.description}`).join("\n") || "none listed"}

Matched requirements (${coverage.matched_requirements.length}): ${coverage.matched_requirements.join(", ") || "none"}

Missing requirements (${coverage.missing_requirements.length}): ${coverage.missing_requirements.join(", ") || "none"}

Overall match score: ${coverage.overall_score}%
Category scores: ${JSON.stringify(coverage.category_scores)}`;
}
