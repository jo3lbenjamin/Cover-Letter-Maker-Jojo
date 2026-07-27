import type {
  CandidateProfile,
  CategorizedRequirement,
  CategoryScores,
  CoverageResult,
  RequirementCategory,
} from "../types/index.js";

const CATEGORIES: RequirementCategory[] = [
  "skills",
  "experience",
  "keywords",
  "education",
  "technologies",
];

/** Low-signal words that appear in most requirements regardless of specifics. */
const STOPWORDS = new Set([
  "degree",
  "degrees",
  "bachelor",
  "bachelors",
  "master",
  "masters",
  "phd",
  "required",
  "preferred",
]);

/** Lowercase, trimmed comparison string. */
function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Build the set of normalized text blocks to search for requirement matches. */
function buildHaystacks(profile: CandidateProfile): string[] {
  const haystacks: string[] = [
    ...profile.skills.map(normalize),
    ...profile.experiences.flatMap((e) => [
      normalize(e.title),
      normalize(e.description),
      ...(e.outcomes || []).map(normalize),
    ]),
    ...(profile.projects || []).flatMap((p) => [
      normalize(p.name),
      normalize(p.description),
      ...(p.technologies || []).map(normalize),
    ]),
  ];

  if (profile.programme) haystacks.push(normalize(profile.programme));
  if (profile.university) haystacks.push(normalize(profile.university));
  if (profile.degree_year) haystacks.push(normalize(profile.degree_year));

  return haystacks.filter((h) => h.length > 0);
}

/**
 * A requirement is considered matched when at least 60% of its significant
 * (length > 2, non-stopword) tokens appear as substrings somewhere in the profile text.
 * This is a deterministic heuristic, not a semantic match.
 */
function requirementMatches(
  requirement: string,
  haystacks: string[],
  profile: CandidateProfile
): boolean {
  const reqTokens = normalize(requirement)
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  if (reqTokens.length === 0) {
    // The requirement is entirely boilerplate (e.g. "Bachelor's degree required").
    // Rather than unconditionally failing it, treat it as satisfied when the
    // candidate has any education signal at all — the closest honest match
    // for a requirement this generic without fabricating a specific degree.
    return Boolean(profile.programme || profile.university || profile.degree_year);
  }

  const matchedTokens = reqTokens.filter((token) =>
    haystacks.some((hay) => hay.includes(token))
  );

  return matchedTokens.length / reqTokens.length >= 0.6;
}

/**
 * Deterministically compute requirement coverage between a candidate profile
 * and a categorized list of job requirements. No LLM calls — this is the
 * source of the "matched/total" numbers shown in the Requirements Coverage panel.
 */
export function computeCoverage(
  profile: CandidateProfile,
  requirements: CategorizedRequirement[]
): CoverageResult {
  const haystacks = buildHaystacks(profile);

  const matched_requirements: string[] = [];
  const missing_requirements: string[] = [];

  const perCategoryTotal: Record<RequirementCategory, number> = {
    skills: 0,
    experience: 0,
    keywords: 0,
    education: 0,
    technologies: 0,
  };
  const perCategoryMatched: Record<RequirementCategory, number> = {
    skills: 0,
    experience: 0,
    keywords: 0,
    education: 0,
    technologies: 0,
  };

  for (const req of requirements) {
    perCategoryTotal[req.category] += 1;
    if (requirementMatches(req.text, haystacks, profile)) {
      matched_requirements.push(req.text);
      perCategoryMatched[req.category] += 1;
    } else {
      missing_requirements.push(req.text);
    }
  }

  const category_scores = CATEGORIES.reduce((acc, cat) => {
    const total = perCategoryTotal[cat];
    acc[cat] = total > 0 ? Math.round((perCategoryMatched[cat] / total) * 100) : 0;
    return acc;
  }, {} as CategoryScores);

  const overall_score =
    requirements.length > 0
      ? Math.round((matched_requirements.length / requirements.length) * 100)
      : 0;

  return { matched_requirements, missing_requirements, category_scores, overall_score };
}
