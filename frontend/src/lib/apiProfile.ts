import type { CandidateProfile } from "@/types/profile";

/**
 * Flattens a CandidateProfile into the shape the backend API schemas expect:
 * the primary education entry inlined as programme/university/degree_year,
 * and client-only `id` fields stripped from experiences/projects.
 */
export function toApiCandidateProfile(profile: CandidateProfile) {
  const { experiences, projects, education, ...rest } = profile;
  const primaryEdu = education[0];

  return {
    ...rest,
    experiences: experiences.map(({ id: _id, ...exp }) => exp),
    projects: projects.map(({ id: _id, ...proj }) => proj),
    ...(primaryEdu?.programme && { programme: primaryEdu.programme }),
    ...(primaryEdu?.university && { university: primaryEdu.university }),
    ...(primaryEdu?.degree_year && { degree_year: primaryEdu.degree_year }),
  };
}
