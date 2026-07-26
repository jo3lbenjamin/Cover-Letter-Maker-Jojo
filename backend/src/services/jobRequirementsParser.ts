import type { CategorizedJobPosting, CategorizedRequirement } from "../types/index.js";
import { chatCompletion } from "./llm.js";
import {
  JOB_REQUIREMENTS_PARSING_SYSTEM_PROMPT,
  buildJobRequirementsParsingUserPrompt,
} from "../prompts/jobRequirementsParsing.js";

const VALID_CATEGORIES = ["skills", "experience", "keywords", "education", "technologies"];

/**
 * Parse raw job posting text into a categorized requirements list using the LLM.
 * Falls back to empty/safe defaults if parsing fails.
 */
export async function parseCategorizedRequirements(
  jobPosting: string
): Promise<CategorizedJobPosting> {
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
    console.error("Categorized job parsing failed:", err);
    return {
      company_name: "Unknown",
      role_title: "the position",
      location: "Not specified",
      requirements: [],
      keywords: [],
      categorized_requirements: [],
    };
  }
}
