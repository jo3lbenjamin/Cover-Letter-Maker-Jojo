import type { CandidateProfile, Experience, Project } from "@/types/profile";
import { DEFAULT_PROFILE } from "./profile";

/** Shape returned by POST /api/profile/extract (flat education fields, no ids). */
interface ExtractedProfile {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  website_url?: string;
  programme?: string;
  university?: string;
  degree_year?: string;
  skills?: string[];
  experiences?: Omit<Experience, "id">[];
  projects?: Omit<Project, "id">[];
}

/** Build a fresh, standalone CandidateProfile from a /api/profile/extract response. */
export function buildProfileFromExtraction(extracted: ExtractedProfile): CandidateProfile {
  const education =
    extracted.programme || extracted.university || extracted.degree_year
      ? [
          {
            id: crypto.randomUUID(),
            programme: extracted.programme || "",
            university: extracted.university || "",
            degree_year: extracted.degree_year || "",
          },
        ]
      : [];

  return {
    ...DEFAULT_PROFILE,
    name: extracted.name || "",
    email: extracted.email || "",
    phone: extracted.phone || "",
    location: extracted.location || "",
    linkedin_url: extracted.linkedin_url || "",
    website_url: extracted.website_url || "",
    skills: extracted.skills || [],
    experiences: (extracted.experiences || []).map((e) => ({ ...e, id: crypto.randomUUID() })),
    projects: (extracted.projects || []).map((p) => ({ ...p, id: crypto.randomUUID() })),
    education,
  };
}
