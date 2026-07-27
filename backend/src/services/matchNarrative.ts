import type { CandidateProfile, CoverageResult, MatchNarrative } from "../types/index.js";
import { chatCompletion } from "./llm.js";
import {
  MATCH_NARRATIVE_SYSTEM_PROMPT,
  buildMatchNarrativeUserPrompt,
} from "../prompts/matchNarrative.js";

const FALLBACK_NARRATIVE: MatchNarrative = {
  strengths: [],
  weaknesses: [],
  critical_missing_skills: [],
  estimated_ranking_band: "Unable to estimate",
};

/**
 * Generate the qualitative narrative (strengths, weaknesses, ranking band)
 * grounded in the deterministic coverage result from coverageMatcher.ts.
 */
export async function generateMatchNarrative(
  profile: CandidateProfile,
  coverage: CoverageResult
): Promise<MatchNarrative> {
  try {
    const raw = await chatCompletion(
      MATCH_NARRATIVE_SYSTEM_PROMPT,
      buildMatchNarrativeUserPrompt(profile, coverage),
      { temperature: 0.4, maxTokens: 1024 }
    );

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      critical_missing_skills: Array.isArray(parsed.critical_missing_skills)
        ? parsed.critical_missing_skills.slice(0, 5)
        : [],
      estimated_ranking_band:
        typeof parsed.estimated_ranking_band === "string"
          ? parsed.estimated_ranking_band
          : FALLBACK_NARRATIVE.estimated_ranking_band,
    };
  } catch (err) {
    console.error("Match narrative generation failed:", err);
    return FALLBACK_NARRATIVE;
  }
}
