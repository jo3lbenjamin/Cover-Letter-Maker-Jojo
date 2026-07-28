import { z } from "zod";

// Treat empty strings as undefined for optional fields
const emptyToUndefined = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
  z.string().optional()
);

const optionalString = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
  z.string().optional()
);


// ── Candidate Profile ──────────────────────────────────────────────

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  start_date: z.string(),
  end_date: emptyToUndefined,
  description: z.string(),
  outcomes: z.array(z.string()).optional(),
});

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  technologies: z.array(z.string()).optional(),
  outcomes: z.array(z.string()).optional(),
});

export const CandidateProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  degree_year: emptyToUndefined,
  programme: emptyToUndefined,
  university: emptyToUndefined,
  location: z.string(),
  phone: z.string(),
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().email("Invalid email address")
  ),
  linkedin_url: optionalString,
  website_url: optionalString,
  availability_default: emptyToUndefined,
  skills: z.array(z.string()),
  experiences: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema).optional(),
});

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Project = z.infer<typeof ProjectSchema>;

// ── Parsed Job Posting ─────────────────────────────────────────────

export interface ParsedJobPosting {
  company_name: string;
  role_title: string;
  location: string;
  requirements: string[];
  keywords: string[];
}

// ── Documents ──────────────────────────────────────────────────────

export type DocumentType = "resume" | "transcript" | "portfolio" | "other";

export interface DocumentRecord {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  document_type: DocumentType;
  storage_path: string;
  extracted_text: string;
  created_at: string;
}

export interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  document_type: DocumentType;
  extracted_text_preview: string;
}

// ── Cover Letter Request / Response ────────────────────────────────

export const CoverLetterRequestSchema = z.object({
  candidate_profile: CandidateProfileSchema,
  job_posting: z.string().min(1, "Job posting is required"),
  company_context: z.string().optional(),
  tone: z
    .enum(["professional", "confident", "concise", "story-driven", "technical"])
    .optional(),
  priority_keywords: z.array(z.string()).optional(),
  availability: z.string().optional(),
  recipient_name: z.string().optional(),
  recipient_title: z.string().optional(),
  recipient_org: z.string().optional(),
  recipient_location: z.string().optional(),
  date: z.string().optional(),
  document_ids: z.array(z.string()).optional(),
  document_texts: z
    .array(z.object({ filename: z.string(), text: z.string() }))
    .optional(),
  system_prompt: z.string().optional(),
  match_context: z
    .object({
      missing_requirements: z.array(z.string()),
      critical_missing_skills: z.array(z.string()),
      weaknesses: z.array(z.string()),
    })
    .optional(),
});

export type CoverLetterRequest = z.infer<typeof CoverLetterRequestSchema>;

export interface ExtractedFields {
  role_title: string;
  company: string;
  recipient_line: string;
  key_requirements: string[];
  matched_experiences: string[];
  chosen_skills: string[];
  used_documents: string[];
}

export interface QualityChecks {
  no_dashes: boolean;
  format_ok: boolean;
  length_ok: boolean;
  availability_mentioned: boolean;
  no_bullets: boolean;
}

export interface CoverLetterResponse {
  cover_letter_text: string;
  extracted_fields: ExtractedFields;
  quality_checks: QualityChecks;
}

// ── Job Fit: Match Analysis ────────────────────────────────────────

export type RequirementCategory =
  | "skills"
  | "experience"
  | "keywords"
  | "education"
  | "technologies";

export interface CategorizedRequirement {
  text: string;
  category: RequirementCategory;
}

export interface CategorizedJobPosting extends ParsedJobPosting {
  categorized_requirements: CategorizedRequirement[];
}

export interface CategoryScores {
  skills: number;
  experience: number;
  keywords: number;
  education: number;
  technologies: number;
}

export interface CoverageResult {
  matched_requirements: string[];
  missing_requirements: string[];
  category_scores: CategoryScores;
  overall_score: number;
}

export interface MatchNarrative {
  strengths: string[];
  weaknesses: string[];
  critical_missing_skills: string[];
  estimated_ranking_band: string;
}

export const MatchAnalysisRequestSchema = z.object({
  candidate_profile: CandidateProfileSchema,
  job_posting: z.string().min(1, "Job posting is required"),
});
export type MatchAnalysisRequest = z.infer<typeof MatchAnalysisRequestSchema>;

export interface MatchAnalysisResponse {
  parsed_job: ParsedJobPosting;
  overall_score: number;
  category_scores: CategoryScores;
  matched_requirements: string[];
  missing_requirements: string[];
  critical_missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  estimated_ranking_band: string;
}

export const ResumeOptimizeRequestSchema = z.object({
  candidate_profile: CandidateProfileSchema,
  job_analysis: z.object({
    matched_requirements: z.array(z.string()),
    missing_requirements: z.array(z.string()),
    critical_missing_skills: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
});
export type ResumeOptimizeRequest = z.infer<typeof ResumeOptimizeRequestSchema>;

export interface ResumeOptimizeResponse {
  optimized_profile: CandidateProfile;
}
