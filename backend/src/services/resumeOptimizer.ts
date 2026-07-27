import type { CandidateProfile, ResumeOptimizeRequest } from "../types/index.js";
import { chatCompletion } from "./llm.js";
import {
  RESUME_OPTIMIZATION_SYSTEM_PROMPT,
  buildResumeOptimizationUserPrompt,
} from "../prompts/resumeOptimization.js";

/**
 * Rewrite resume content to better match a job's requirements, grounded
 * only in facts already present in the input profile. Falls back to the
 * original, unmodified profile if the LLM response cannot be parsed.
 */
export async function optimizeResume(
  profile: CandidateProfile,
  jobAnalysis: ResumeOptimizeRequest["job_analysis"]
): Promise<CandidateProfile> {
  try {
    const raw = await chatCompletion(
      RESUME_OPTIMIZATION_SYSTEM_PROMPT,
      buildResumeOptimizationUserPrompt(profile, jobAnalysis),
      { temperature: 0.4, maxTokens: 4096 }
    );

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      ...profile,
      name: parsed.name || profile.name,
      email: parsed.email || profile.email,
      phone: parsed.phone || profile.phone,
      location: parsed.location || profile.location,
      linkedin_url: parsed.linkedin_url ?? profile.linkedin_url,
      website_url: parsed.website_url ?? profile.website_url,
      availability_default: parsed.availability_default ?? profile.availability_default,
      degree_year: parsed.degree_year ?? profile.degree_year,
      programme: parsed.programme ?? profile.programme,
      university: parsed.university ?? profile.university,
      skills: Array.isArray(parsed.skills) ? parsed.skills : profile.skills,
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : profile.experiences,
      projects: Array.isArray(parsed.projects) ? parsed.projects : profile.projects,
    };
  } catch (err) {
    console.error("Resume optimization failed, returning original profile:", err);
    return profile;
  }
}
