import type { CategorizedJobPosting, CategorizedRequirement } from "../types/index.js";
import { chatCompletion } from "./llm.js";
import {
  JOB_REQUIREMENTS_PARSING_SYSTEM_PROMPT,
  buildJobRequirementsParsingUserPrompt,
} from "../prompts/jobRequirementsParsing.js";

const VALID_CATEGORIES = ["skills", "experience", "keywords", "education", "technologies"];

/**
 * Parse raw job posting text into a categorized requirements list using the LLM.
 * Retries once on failure; if both attempts fail, throws rather than returning
 * safe defaults, since silent empty defaults would produce a confident but
 * fabricated 0% match score downstream.
 */
export async function parseCategorizedRequirements(
  jobPosting: string
): Promise<CategorizedJobPosting> {
  const MAX_ATTEMPTS = 2;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await chatCompletion(
        JOB_REQUIREMENTS_PARSING_SYSTEM_PROMPT,
        buildJobRequirementsParsingUserPrompt(jobPosting),
        { temperature: 0.2, maxTokens: 2048 }
      );

      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);

      const categorized_requirements: CategorizedRequirement[] = Array.isArray(
        parsed.categorized_requirements
      )
        ? parsed.categorized_requirements
            .filter(
              (r: Record<string, unknown>) =>
                typeof r.text === "string" && VALID_CATEGORIES.includes(r.category as string)
            )
            .slice(0, 24)
            .map((r: Record<string, unknown>) => ({
              text: r.text as string,
              category: r.category as CategorizedRequirement["category"],
            }))
        : [];

      return {
        company_name: parsed.company_name || "Unknown",
        role_title: parsed.role_title || "the position",
        location: parsed.location || "Not specified",
        requirements: categorized_requirements.map((r) => r.text),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [],
        categorized_requirements,
      };
    } catch (err) {
      lastErr = err;
      console.error(`Categorized job parsing failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
    }
  }

  throw new Error(
    `Failed to parse job requirements after ${MAX_ATTEMPTS} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}
