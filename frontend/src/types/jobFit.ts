import type { CandidateProfile } from "./profile";

export type RequirementCategory =
  | "skills"
  | "experience"
  | "keywords"
  | "education"
  | "technologies";

export interface ResumeRecord {
  id: string;
  name: string;
  profile: CandidateProfile;
  raw_text: string;
  source: "upload" | "optimized";
  parent_resume_id?: string;
  job_analysis_id?: string;
  created_at: string;
}

export interface CategoryScores {
  skills: number;
  experience: number;
  keywords: number;
  education: number;
  technologies: number;
}

export interface MatchAnalysisApiResponse {
  parsed_job: {
    company_name: string;
    role_title: string;
    location: string;
    requirements: string[];
    keywords: string[];
  };
  overall_score: number;
  category_scores: CategoryScores;
  matched_requirements: string[];
  missing_requirements: string[];
  critical_missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  estimated_ranking_band: string;
}

export interface JobAnalysisRecord extends MatchAnalysisApiResponse {
  id: string;
  resume_id: string;
  job_posting_text: string;
  created_at: string;
}
