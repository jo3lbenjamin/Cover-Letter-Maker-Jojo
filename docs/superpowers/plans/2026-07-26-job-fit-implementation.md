# Job Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Job Fit" feature to CoverCraft: users upload/select a resume, paste a job posting, get an ATS Match Score with a Requirements Coverage panel, can generate an AI-optimized resume, and hand off into the existing cover letter generator.

**Architecture:** Backend stays stateless (Express + Groq LLM). Two new stateless endpoints (`POST /api/job/match`, `POST /api/resume/optimize`) built on a two-stage pipeline: a pure, deterministic requirement-matcher (Stage 1, unit-testable without the LLM) followed by an LLM call that writes only the qualitative narrative grounded in Stage 1's real numbers (Stage 2). Frontend adds a new "Job Fit" page reusing the app's existing client-side extraction, existing `/api/profile/extract` pipeline, and a `localStorage`-backed resume/analysis store built behind a small storage interface so it can be swapped for a real database later without touching UI code.

**Tech Stack:** Node.js/Express/TypeScript/Zod (backend), React/TypeScript/Vite/shadcn-ui/Tailwind (frontend), Groq SDK (LLM), vitest/supertest (backend tests), vitest (frontend lib tests).

## Global Constraints

- Reuse the existing visual theme exactly: shadcn/ui components already in the app (`Button`, `Badge`, `Card`-style `rounded-xl border border-border/50 bg-card` containers, `Progress`), the same Tailwind utility classes and `accent` color usage as `frontend/src/pages/Index.tsx` and `frontend/src/components/ProfileEditor.tsx`. Do not introduce new colors, fonts, or component libraries.
- Backend stays stateless — no new server-side persistence. All new records (`ResumeRecord`, `JobAnalysisRecord`) live in `localStorage` only.
- Files never leave the browser — resume text extraction is client-side only (`frontend/src/lib/fileTextExtractor.ts`), matching the existing "files never leave the browser" principle documented in `docs/developer-guide.md`.
- No fabrication — the resume optimizer must only rephrase/reorganize facts already present in the input profile, mirroring the existing "no invented facts" rule in `backend/src/prompts/coverLetter.ts`.
- Follow existing Zod-validation-at-the-boundary + try/catch-to-500 pattern used in `backend/src/routes/coverLetter.ts` for all new routes.
- Resume library capped at 20 entries (`MAX_RESUMES`), mirroring the existing 50-entry cap on cover letter history (`frontend/src/lib/history.ts`).

---

### Task 1: Backend — Shared match/optimize types

**Files:**
- Modify: `backend/src/types/index.ts`

**Interfaces:**
- Produces: `RequirementCategory`, `CategorizedRequirement`, `CategorizedJobPosting`, `CategoryScores`, `CoverageResult`, `MatchNarrative`, `MatchAnalysisRequestSchema`/`MatchAnalysisRequest`, `MatchAnalysisResponse`, `ResumeOptimizeRequestSchema`/`ResumeOptimizeRequest`, `ResumeOptimizeResponse` — used by every later backend task.

- [ ] **Step 1: Add the new types to `backend/src/types/index.ts`**

Append to the end of the file (after the existing `CoverLetterResponse` block):

```typescript
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
```

- [ ] **Step 2: Verify the backend still compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/index.ts
git commit -m "feat(job-fit): add match analysis and resume optimize types"
```

---

### Task 2: Backend — Categorized job requirements parser

**Files:**
- Create: `backend/src/prompts/jobRequirementsParsing.ts`
- Create: `backend/src/services/jobRequirementsParser.ts`
- Test: `backend/tests/jobRequirementsParser.test.ts`

**Interfaces:**
- Consumes: `chatCompletion(systemPrompt, userPrompt, options)` from `backend/src/services/llm.js`; `CategorizedJobPosting`, `CategorizedRequirement` from `../types/index.js` (Task 1).
- Produces: `parseCategorizedRequirements(jobPosting: string): Promise<CategorizedJobPosting>` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/jobRequirementsParser.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { parseCategorizedRequirements } from "../src/services/jobRequirementsParser.js";

const mockedChat = vi.mocked(chatCompletion);

const MOCK_RESPONSE = JSON.stringify({
  company_name: "Acme Corp",
  role_title: "Backend Engineer",
  location: "Toronto, ON",
  keywords: ["Node.js", "PostgreSQL"],
  categorized_requirements: [
    { text: "3+ years backend development", category: "experience" },
    { text: "Docker", category: "technologies" },
    { text: "AWS", category: "technologies" },
    { text: "Bachelor's degree in Computer Science", category: "education" },
    { text: "Strong communication skills", category: "skills" },
    { text: "invalid entry", category: "not-a-real-category" },
  ],
});

describe("parseCategorizedRequirements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns categorized requirements with valid categories only", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_RESPONSE);

    const result = await parseCategorizedRequirements("some job posting text");

    expect(result.company_name).toBe("Acme Corp");
    expect(result.role_title).toBe("Backend Engineer");
    expect(result.categorized_requirements).toHaveLength(5);
    expect(result.categorized_requirements.map((r) => r.category)).not.toContain(
      "not-a-real-category"
    );
    expect(result.requirements).toEqual(
      result.categorized_requirements.map((r) => r.text)
    );
  });

  it("falls back to safe defaults when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await parseCategorizedRequirements("some job posting text");

    expect(result.company_name).toBe("Unknown");
    expect(result.categorized_requirements).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/jobRequirementsParser.test.ts`
Expected: FAIL — `Cannot find module '../src/services/jobRequirementsParser.js'`

- [ ] **Step 3: Write the prompt**

Create `backend/src/prompts/jobRequirementsParsing.ts`:

```typescript
/**
 * System prompt for extracting a comprehensive, categorized requirements
 * list from a job posting, used for ATS match scoring.
 */
export const JOB_REQUIREMENTS_PARSING_SYSTEM_PROMPT = `You are a job posting parser specialized in extracting a comprehensive, categorized requirements list for resume matching. Given a raw job posting, return ONLY valid JSON with no additional commentary.

Required JSON shape:
{
  "company_name": "string (company name, or 'Unknown' if not found)",
  "role_title": "string (job title)",
  "location": "string (city, state, country, or 'Not specified')",
  "keywords": ["array of important technical/domain keywords, max 10"],
  "categorized_requirements": [
    { "text": "string, concise requirement under 15 words", "category": "skills | experience | keywords | education | technologies" }
  ]
}

Rules:
1. Return ONLY the JSON object, nothing else.
2. Do not wrap in markdown code fences.
3. Extract up to 24 distinct requirements across all categories combined.
4. "skills" = soft/hard skills and competencies (e.g. "communication", "project management").
5. "experience" = years of experience, seniority, domain experience (e.g. "3+ years backend development").
6. "keywords" = general domain/industry terms not covered by other categories.
7. "education" = degree, certification, or academic requirements.
8. "technologies" = specific tools, languages, frameworks, or platforms (e.g. "Docker", "AWS", "React").
9. Every requirement must be categorized into exactly one of the five categories above.
10. If a field cannot be determined, use the default shown above.`;

export function buildJobRequirementsParsingUserPrompt(jobPosting: string): string {
  return `Parse this job posting into categorized requirements:\n\n${jobPosting}`;
}
```

- [ ] **Step 4: Write the service**

Create `backend/src/services/jobRequirementsParser.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/jobRequirementsParser.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/prompts/jobRequirementsParsing.ts backend/src/services/jobRequirementsParser.ts backend/tests/jobRequirementsParser.test.ts
git commit -m "feat(job-fit): add categorized job requirements parser"
```

---

### Task 3: Backend — Deterministic coverage matcher (Stage 1, pure function)

**Files:**
- Create: `backend/src/services/coverageMatcher.ts`
- Test: `backend/tests/coverageMatcher.test.ts`

**Interfaces:**
- Consumes: `CandidateProfile`, `CategorizedRequirement`, `CoverageResult`, `CategoryScores` from `../types/index.js` (Task 1).
- Produces: `computeCoverage(profile: CandidateProfile, requirements: CategorizedRequirement[]): CoverageResult` — consumed by Task 5. This is a pure function with no LLM calls — it is what backs the Requirements Coverage panel's "18/24 matched" style numbers.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/coverageMatcher.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeCoverage } from "../src/services/coverageMatcher.js";
import type { CandidateProfile, CategorizedRequirement } from "../src/types/index.js";

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "React", "SQL", "Docker"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Built and maintained microservices for a fintech platform.",
      outcomes: ["Reduced API latency by 30%"],
    },
  ],
  projects: [],
  programme: "Computer Science",
  university: "University of Toronto",
};

const REQUIREMENTS: CategorizedRequirement[] = [
  { text: "Python", category: "technologies" },
  { text: "AWS", category: "technologies" },
  { text: "3+ years backend development experience", category: "experience" },
  { text: "Bachelor's degree in Computer Science", category: "education" },
  { text: "Strong communication skills", category: "skills" },
];

describe("computeCoverage", () => {
  it("matches requirements found in the profile", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);

    expect(result.matched_requirements).toContain("Python");
    expect(result.matched_requirements).toContain("Bachelor's degree in Computer Science");
    expect(result.missing_requirements).toContain("AWS");
  });

  it("computes per-category scores as a percentage", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);

    expect(result.category_scores.technologies).toBe(50); // 1 of 2 matched (Python yes, AWS no)
    expect(result.category_scores.education).toBe(100); // 1 of 1 matched
  });

  it("computes overall_score as matched/total requirements", () => {
    const result = computeCoverage(PROFILE, REQUIREMENTS);
    const expectedMatchedCount =
      result.matched_requirements.length;

    expect(result.overall_score).toBe(
      Math.round((expectedMatchedCount / REQUIREMENTS.length) * 100)
    );
  });

  it("returns zero scores when there are no requirements", () => {
    const result = computeCoverage(PROFILE, []);

    expect(result.overall_score).toBe(0);
    expect(result.matched_requirements).toEqual([]);
    expect(result.missing_requirements).toEqual([]);
  });

  it("returns a category score of 0 for categories with no requirements", () => {
    const result = computeCoverage(PROFILE, [
      { text: "Python", category: "technologies" },
    ]);

    expect(result.category_scores.skills).toBe(0);
    expect(result.category_scores.experience).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/coverageMatcher.test.ts`
Expected: FAIL — `Cannot find module '../src/services/coverageMatcher.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/coverageMatcher.ts`:

```typescript
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
 * (length > 2) tokens appear as substrings somewhere in the profile text.
 * This is a deterministic heuristic, not a semantic match.
 */
function requirementMatches(requirement: string, haystacks: string[]): boolean {
  const reqTokens = normalize(requirement)
    .split(/\W+/)
    .filter((t) => t.length > 2);

  if (reqTokens.length === 0) return false;

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
    if (requirementMatches(req.text, haystacks)) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/coverageMatcher.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/coverageMatcher.ts backend/tests/coverageMatcher.test.ts
git commit -m "feat(job-fit): add deterministic requirement coverage matcher"
```

---

### Task 4: Backend — LLM match narrative (Stage 2)

**Files:**
- Create: `backend/src/prompts/matchNarrative.ts`
- Create: `backend/src/services/matchNarrative.ts`
- Test: `backend/tests/matchNarrative.test.ts`

**Interfaces:**
- Consumes: `chatCompletion` from `../services/llm.js`; `CandidateProfile`, `CoverageResult`, `MatchNarrative` from `../types/index.js` (Task 1).
- Produces: `generateMatchNarrative(profile: CandidateProfile, coverage: CoverageResult): Promise<MatchNarrative>` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/matchNarrative.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { generateMatchNarrative } from "../src/services/matchNarrative.js";
import type { CandidateProfile, CoverageResult } from "../src/types/index.js";

const mockedChat = vi.mocked(chatCompletion);

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "React", "SQL"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Built microservices for a fintech platform.",
    },
  ],
  projects: [],
};

const COVERAGE: CoverageResult = {
  matched_requirements: ["Python", "SQL"],
  missing_requirements: ["Docker", "AWS"],
  category_scores: { skills: 100, experience: 50, keywords: 60, education: 0, technologies: 30 },
  overall_score: 62,
};

const MOCK_RESPONSE = JSON.stringify({
  strengths: ["Strong Python and SQL background", "Relevant fintech experience"],
  weaknesses: ["Bullet points lack measurable outcomes"],
  critical_missing_skills: ["Docker", "AWS"],
  estimated_ranking_band: "Strong candidate (Top 20-30%)",
});

describe("generateMatchNarrative", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns strengths, weaknesses, and ranking band from the LLM", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_RESPONSE);

    const result = await generateMatchNarrative(PROFILE, COVERAGE);

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses).toContain("Bullet points lack measurable outcomes");
    expect(result.critical_missing_skills).toEqual(["Docker", "AWS"]);
    expect(result.estimated_ranking_band).toBe("Strong candidate (Top 20-30%)");
  });

  it("falls back to safe defaults when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await generateMatchNarrative(PROFILE, COVERAGE);

    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.critical_missing_skills).toEqual([]);
    expect(result.estimated_ranking_band).toBe("Unable to estimate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/matchNarrative.test.ts`
Expected: FAIL — `Cannot find module '../src/services/matchNarrative.js'`

- [ ] **Step 3: Write the prompt**

Create `backend/src/prompts/matchNarrative.ts`:

```typescript
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
```

- [ ] **Step 4: Write the service**

Create `backend/src/services/matchNarrative.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/matchNarrative.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/prompts/matchNarrative.ts backend/src/services/matchNarrative.ts backend/tests/matchNarrative.test.ts
git commit -m "feat(job-fit): add LLM match narrative generator"
```

---

### Task 5: Backend — Match analyzer orchestrator + `POST /api/job/match` route

**Files:**
- Create: `backend/src/services/matchAnalyzer.ts`
- Modify: `backend/src/routes/job.ts`
- Test: `backend/tests/matchAnalyzer.test.ts`
- Test: `backend/tests/matchRoute.test.ts`

**Interfaces:**
- Consumes: `parseCategorizedRequirements` (Task 2), `computeCoverage` (Task 3), `generateMatchNarrative` (Task 4), `MatchAnalysisRequestSchema`, `MatchAnalysisResponse` (Task 1).
- Produces: `analyzeMatch(profile: CandidateProfile, jobPosting: string): Promise<MatchAnalysisResponse>` and the `POST /api/job/match` HTTP endpoint — consumed by the frontend in Task 9.

- [ ] **Step 1: Write the failing orchestrator test**

Create `backend/tests/matchAnalyzer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { analyzeMatch } from "../src/services/matchAnalyzer.js";
import type { CandidateProfile } from "../src/types/index.js";

const mockedChat = vi.mocked(chatCompletion);

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "SQL"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Built microservices for a fintech platform.",
    },
  ],
  projects: [],
};

const MOCK_CATEGORIZED_JOB = JSON.stringify({
  company_name: "Acme Corp",
  role_title: "Backend Engineer",
  location: "Toronto, ON",
  keywords: ["Python", "fintech"],
  categorized_requirements: [
    { text: "Python", category: "technologies" },
    { text: "Docker", category: "technologies" },
  ],
});

const MOCK_NARRATIVE = JSON.stringify({
  strengths: ["Strong Python background"],
  weaknesses: ["Bullet points lack measurable outcomes"],
  critical_missing_skills: ["Docker"],
  estimated_ranking_band: "Competitive",
});

describe("analyzeMatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("combines Stage 1 coverage with Stage 2 narrative into one response", async () => {
    mockedChat
      .mockResolvedValueOnce(MOCK_CATEGORIZED_JOB)
      .mockResolvedValueOnce(MOCK_NARRATIVE);

    const result = await analyzeMatch(PROFILE, "some job posting text");

    expect(result.parsed_job.company_name).toBe("Acme Corp");
    expect(result.matched_requirements).toContain("Python");
    expect(result.missing_requirements).toContain("Docker");
    expect(result.overall_score).toBe(50);
    expect(result.strengths).toEqual(["Strong Python background"]);
    expect(result.critical_missing_skills).toEqual(["Docker"]);
    expect(result.estimated_ranking_band).toBe("Competitive");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/matchAnalyzer.test.ts`
Expected: FAIL — `Cannot find module '../src/services/matchAnalyzer.js'`

- [ ] **Step 3: Write the orchestrator**

Create `backend/src/services/matchAnalyzer.ts`:

```typescript
import type { CandidateProfile, MatchAnalysisResponse } from "../types/index.js";
import { parseCategorizedRequirements } from "./jobRequirementsParser.js";
import { computeCoverage } from "./coverageMatcher.js";
import { generateMatchNarrative } from "./matchNarrative.js";

/**
 * Full match analysis pipeline: categorize job requirements, compute
 * deterministic coverage against the profile, then generate the LLM
 * narrative grounded in that coverage.
 */
export async function analyzeMatch(
  profile: CandidateProfile,
  jobPosting: string
): Promise<MatchAnalysisResponse> {
  const categorizedJob = await parseCategorizedRequirements(jobPosting);
  const coverage = computeCoverage(profile, categorizedJob.categorized_requirements);
  const narrative = await generateMatchNarrative(profile, coverage);

  return {
    parsed_job: {
      company_name: categorizedJob.company_name,
      role_title: categorizedJob.role_title,
      location: categorizedJob.location,
      requirements: categorizedJob.requirements,
      keywords: categorizedJob.keywords,
    },
    overall_score: coverage.overall_score,
    category_scores: coverage.category_scores,
    matched_requirements: coverage.matched_requirements,
    missing_requirements: coverage.missing_requirements,
    critical_missing_skills: narrative.critical_missing_skills,
    strengths: narrative.strengths,
    weaknesses: narrative.weaknesses,
    estimated_ranking_band: narrative.estimated_ranking_band,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/matchAnalyzer.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing route test**

Create `backend/tests/matchRoute.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  process.env.VERCEL = "1";
  const mod = await import("../src/index.js");
  app = mod.default;
});

describe("POST /api/job/match", () => {
  it("rejects a request with missing job_posting", async () => {
    const res = await request(app)
      .post("/api/job/match")
      .send({
        candidate_profile: {
          name: "Jane Doe",
          location: "Toronto",
          phone: "555-0199",
          email: "jane@example.com",
          skills: [],
          experiences: [],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects a request with an invalid candidate_profile", async () => {
    const res = await request(app)
      .post("/api/job/match")
      .send({ candidate_profile: { name: "" }, job_posting: "Backend Engineer role" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/matchRoute.test.ts`
Expected: FAIL — 404 (route does not exist yet)

- [ ] **Step 7: Add the route**

Modify `backend/src/routes/job.ts`. Add this import near the top (after the existing imports):

```typescript
import { MatchAnalysisRequestSchema } from "../types/index.js";
import { analyzeMatch } from "../services/matchAnalyzer.js";
```

Add this route before the final `export default router;` line:

```typescript
// POST /api/job/match
router.post("/match", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = MatchAnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await analyzeMatch(parsed.data.candidate_profile, parsed.data.job_posting);
    res.json(result);
  } catch (err) {
    console.error("Match analysis failed:", err);
    const message = err instanceof Error ? err.message : "Match analysis failed";
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/matchRoute.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS, no regressions in existing suites.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/matchAnalyzer.ts backend/src/routes/job.ts backend/tests/matchAnalyzer.test.ts backend/tests/matchRoute.test.ts
git commit -m "feat(job-fit): add match analyzer orchestrator and POST /api/job/match"
```

---

### Task 6: Backend — Resume optimizer + `POST /api/resume/optimize` route

**Files:**
- Create: `backend/src/prompts/resumeOptimization.ts`
- Create: `backend/src/services/resumeOptimizer.ts`
- Create: `backend/src/routes/resume.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/tests/resumeOptimizer.test.ts`
- Test: `backend/tests/resumeOptimizeRoute.test.ts`

**Interfaces:**
- Consumes: `chatCompletion` from `../services/llm.js`; `CandidateProfile`, `ResumeOptimizeRequestSchema` from `../types/index.js` (Task 1).
- Produces: `optimizeResume(profile: CandidateProfile, jobAnalysis: ResumeOptimizeRequest["job_analysis"]): Promise<CandidateProfile>` and the `POST /api/resume/optimize` HTTP endpoint — consumed by the frontend in Task 11.

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/resumeOptimizer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../src/services/llm.js";
import { optimizeResume } from "../src/services/resumeOptimizer.js";
import type { CandidateProfile } from "../src/types/index.js";

const mockedChat = vi.mocked(chatCompletion);

const PROFILE: CandidateProfile = {
  name: "Jane Doe",
  location: "Toronto, Ontario",
  phone: "(416) 555 0199",
  email: "jane@example.com",
  skills: ["Python", "SQL"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      description: "Worked on backend services.",
      outcomes: [],
    },
  ],
  projects: [],
};

const MOCK_OPTIMIZED = JSON.stringify({
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(416) 555 0199",
  location: "Toronto, Ontario",
  skills: ["Python", "SQL", "Backend Development"],
  experiences: [
    {
      title: "Backend Engineer",
      company: "TechStart Inc.",
      start_date: "May 2023",
      end_date: "",
      description: "Built and maintained backend services handling production traffic.",
      outcomes: [],
    },
  ],
  projects: [],
});

describe("optimizeResume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an updated profile from the LLM response", async () => {
    mockedChat.mockResolvedValueOnce(MOCK_OPTIMIZED);

    const result = await optimizeResume(PROFILE, {
      matched_requirements: ["Python"],
      missing_requirements: ["Docker"],
      critical_missing_skills: ["Docker"],
      weaknesses: ["Descriptions are too generic"],
    });

    expect(result.name).toBe("Jane Doe");
    expect(result.experiences[0].description).toContain("production traffic");
  });

  it("falls back to the original profile when the LLM response is not valid JSON", async () => {
    mockedChat.mockResolvedValueOnce("not json");

    const result = await optimizeResume(PROFILE, {
      matched_requirements: [],
      missing_requirements: [],
      critical_missing_skills: [],
      weaknesses: [],
    });

    expect(result).toEqual(PROFILE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/resumeOptimizer.test.ts`
Expected: FAIL — `Cannot find module '../src/services/resumeOptimizer.js'`

- [ ] **Step 3: Write the prompt**

Create `backend/src/prompts/resumeOptimization.ts`:

```typescript
import type { CandidateProfile, ResumeOptimizeRequest } from "../types/index.js";

/**
 * System prompt for rewriting resume content to better match a job's
 * requirements without inventing new facts.
 */
export const RESUME_OPTIMIZATION_SYSTEM_PROMPT = `You are a resume editor. You rewrite resume content to better match a target job's requirements. You output ONLY valid JSON with no additional commentary.

Required JSON shape (same structure as the input candidate profile):
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin_url": "string or omitted",
  "website_url": "string or omitted",
  "availability_default": "string or omitted",
  "degree_year": "string or omitted",
  "programme": "string or omitted",
  "university": "string or omitted",
  "skills": ["array of strings"],
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "start_date": "string",
      "end_date": "string or empty",
      "description": "string",
      "outcomes": ["array of strings"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["array of strings"],
      "outcomes": ["array of strings"]
    }
  ]
}

ABSOLUTE RULES:
1. NEVER invent employers, job titles, skills, technologies, dates, or outcomes not already present in the input profile.
2. You MAY rephrase descriptions and reorder skills to emphasize relevance to the target job's matched and missing requirements.
3. You MAY tighten vague bullet points into more specific language, but only using facts already stated in the input.
4. Do not fabricate metrics or numbers that are not already present in the input profile.
5. Preserve every field from the input profile; only improve wording where the job analysis identifies a weakness or gap that can be addressed with real, existing content.
6. Return ONLY the JSON object, nothing else. Do not wrap in markdown code fences.`;

export function buildResumeOptimizationUserPrompt(
  profile: CandidateProfile,
  jobAnalysis: ResumeOptimizeRequest["job_analysis"]
): string {
  return `Current candidate profile (JSON):
${JSON.stringify(profile)}

Matched requirements: ${jobAnalysis.matched_requirements.join(", ") || "none"}
Missing requirements: ${jobAnalysis.missing_requirements.join(", ") || "none"}
Critical missing skills: ${jobAnalysis.critical_missing_skills.join(", ") || "none"}
Identified weaknesses: ${jobAnalysis.weaknesses.join("; ") || "none"}

Rewrite the profile to better address the identified weaknesses and emphasize the matched requirements, following the absolute rules exactly.`;
}
```

- [ ] **Step 4: Write the service**

Create `backend/src/services/resumeOptimizer.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/resumeOptimizer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing route test**

Create `backend/tests/resumeOptimizeRoute.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  process.env.VERCEL = "1";
  const mod = await import("../src/index.js");
  app = mod.default;
});

describe("POST /api/resume/optimize", () => {
  it("rejects a request with missing job_analysis", async () => {
    const res = await request(app)
      .post("/api/resume/optimize")
      .send({
        candidate_profile: {
          name: "Jane Doe",
          location: "Toronto",
          phone: "555-0199",
          email: "jane@example.com",
          skills: [],
          experiences: [],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/resumeOptimizeRoute.test.ts`
Expected: FAIL — 404 (route does not exist yet)

- [ ] **Step 8: Write the route**

Create `backend/src/routes/resume.ts`:

```typescript
import { Router, Request, Response } from "express";
import { ResumeOptimizeRequestSchema } from "../types/index.js";
import { optimizeResume } from "../services/resumeOptimizer.js";

const router = Router();

// POST /api/resume/optimize
router.post("/optimize", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ResumeOptimizeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const optimized_profile = await optimizeResume(
      parsed.data.candidate_profile,
      parsed.data.job_analysis
    );
    res.json({ optimized_profile });
  } catch (err) {
    console.error("Resume optimize route failed:", err);
    const message = err instanceof Error ? err.message : "Resume optimization failed";
    res.status(500).json({ error: message });
  }
});

export default router;
```

- [ ] **Step 9: Mount the router**

Modify `backend/src/index.ts`. Add this import after the existing `jobRouter` import:

```typescript
import resumeRouter from "./routes/resume.js";
```

Add this line after `app.use("/api/job", jobRouter);`:

```typescript
app.use("/api/resume", resumeRouter);
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/resumeOptimizeRoute.test.ts`
Expected: PASS (1 test)

- [ ] **Step 11: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS, no regressions.

- [ ] **Step 12: Commit**

```bash
git add backend/src/prompts/resumeOptimization.ts backend/src/services/resumeOptimizer.ts backend/src/routes/resume.ts backend/src/index.ts backend/tests/resumeOptimizer.test.ts backend/tests/resumeOptimizeRoute.test.ts
git commit -m "feat(job-fit): add resume optimizer and POST /api/resume/optimize"
```

---

### Task 7: Frontend — Job Fit types, resume store, and job analysis store

**Files:**
- Create: `frontend/src/types/jobFit.ts`
- Create: `frontend/src/lib/resumeStore.ts`
- Create: `frontend/src/lib/jobAnalysisStore.ts`
- Test: `frontend/src/lib/resumeStore.test.ts`
- Test: `frontend/src/lib/jobAnalysisStore.test.ts`

**Interfaces:**
- Consumes: `CandidateProfile` from `@/types/profile`.
- Produces: `ResumeRecord`, `JobAnalysisRecord`, `MatchAnalysisApiResponse`, `CategoryScores` types; `resumeStore: ResumeStore` (`list`, `get`, `save`, `remove`) and `MAX_RESUMES`; `jobAnalysisStore: JobAnalysisStore` (`list`, `get`, `save`, `listForResume`) — consumed by Task 8, 9, 10, 11, 12.

- [ ] **Step 1: Write the types**

Create `frontend/src/types/jobFit.ts`:

```typescript
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
```

- [ ] **Step 2: Write the failing resume store test**

Create `frontend/src/lib/resumeStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resumeStore, MAX_RESUMES } from "./resumeStore";
import type { ResumeRecord } from "@/types/jobFit";
import { DEFAULT_PROFILE } from "./profile";

function makeResume(overrides?: Partial<ResumeRecord>): ResumeRecord {
  return {
    id: crypto.randomUUID(),
    name: "Test Resume",
    profile: { ...DEFAULT_PROFILE },
    raw_text: "Resume text",
    source: "upload",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("resumeStore", () => {
  beforeEach(() => localStorage.clear());

  it("saves and lists resumes, most recent first", () => {
    const first = makeResume({ name: "First" });
    const second = makeResume({ name: "Second" });
    resumeStore.save(first);
    resumeStore.save(second);

    const all = resumeStore.list();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Second");
  });

  it("gets a resume by id", () => {
    const resume = makeResume();
    resumeStore.save(resume);

    expect(resumeStore.get(resume.id)?.name).toBe("Test Resume");
    expect(resumeStore.get("nonexistent")).toBeUndefined();
  });

  it("removes a resume by id", () => {
    const resume = makeResume();
    resumeStore.save(resume);
    resumeStore.remove(resume.id);

    expect(resumeStore.get(resume.id)).toBeUndefined();
  });

  it("caps the library at MAX_RESUMES entries", () => {
    for (let i = 0; i < MAX_RESUMES + 5; i++) {
      resumeStore.save(makeResume({ name: `Resume ${i}` }));
    }

    expect(resumeStore.list()).toHaveLength(MAX_RESUMES);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/resumeStore.test.ts`
Expected: FAIL — `Cannot find module './resumeStore'`

- [ ] **Step 4: Write the resume store**

Create `frontend/src/lib/resumeStore.ts`:

```typescript
import type { ResumeRecord } from "@/types/jobFit";

const STORAGE_KEY = "covercraft-resumes";
export const MAX_RESUMES = 20;

export interface ResumeStore {
  list(): ResumeRecord[];
  get(id: string): ResumeRecord | undefined;
  save(resume: ResumeRecord): void;
  remove(id: string): void;
}

class LocalStorageResumeStore implements ResumeStore {
  list(): ResumeRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  get(id: string): ResumeRecord | undefined {
    return this.list().find((r) => r.id === id);
  }

  save(resume: ResumeRecord): void {
    const resumes = this.list().filter((r) => r.id !== resume.id);
    resumes.unshift(resume);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resumes.slice(0, MAX_RESUMES)));
  }

  remove(id: string): void {
    const resumes = this.list().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resumes));
  }
}

export const resumeStore: ResumeStore = new LocalStorageResumeStore();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/resumeStore.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing job analysis store test**

Create `frontend/src/lib/jobAnalysisStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { jobAnalysisStore } from "./jobAnalysisStore";
import type { JobAnalysisRecord } from "@/types/jobFit";

function makeAnalysis(overrides?: Partial<JobAnalysisRecord>): JobAnalysisRecord {
  return {
    id: crypto.randomUUID(),
    resume_id: "resume-1",
    job_posting_text: "Backend Engineer role",
    parsed_job: {
      company_name: "Acme",
      role_title: "Backend Engineer",
      location: "Toronto",
      requirements: [],
      keywords: [],
    },
    overall_score: 80,
    category_scores: { skills: 80, experience: 80, keywords: 80, education: 80, technologies: 80 },
    matched_requirements: [],
    missing_requirements: [],
    critical_missing_skills: [],
    strengths: [],
    weaknesses: [],
    estimated_ranking_band: "Competitive",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("jobAnalysisStore", () => {
  beforeEach(() => localStorage.clear());

  it("saves and lists analyses, most recent first", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1" }));
    jobAnalysisStore.save(makeAnalysis({ id: "a2" }));

    const all = jobAnalysisStore.list();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe("a2");
  });

  it("gets an analysis by id", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1" }));
    expect(jobAnalysisStore.get("a1")?.id).toBe("a1");
  });

  it("filters analyses by resume id", () => {
    jobAnalysisStore.save(makeAnalysis({ id: "a1", resume_id: "resume-1" }));
    jobAnalysisStore.save(makeAnalysis({ id: "a2", resume_id: "resume-2" }));

    const forResume1 = jobAnalysisStore.listForResume("resume-1");
    expect(forResume1).toHaveLength(1);
    expect(forResume1[0].id).toBe("a1");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/jobAnalysisStore.test.ts`
Expected: FAIL — `Cannot find module './jobAnalysisStore'`

- [ ] **Step 8: Write the job analysis store**

Create `frontend/src/lib/jobAnalysisStore.ts`:

```typescript
import type { JobAnalysisRecord } from "@/types/jobFit";

const STORAGE_KEY = "covercraft-job-analyses";
const MAX_ANALYSES = 50;

export interface JobAnalysisStore {
  list(): JobAnalysisRecord[];
  get(id: string): JobAnalysisRecord | undefined;
  listForResume(resumeId: string): JobAnalysisRecord[];
  save(analysis: JobAnalysisRecord): void;
}

class LocalStorageJobAnalysisStore implements JobAnalysisStore {
  list(): JobAnalysisRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  get(id: string): JobAnalysisRecord | undefined {
    return this.list().find((a) => a.id === id);
  }

  listForResume(resumeId: string): JobAnalysisRecord[] {
    return this.list().filter((a) => a.resume_id === resumeId);
  }

  save(analysis: JobAnalysisRecord): void {
    const analyses = this.list().filter((a) => a.id !== analysis.id);
    analyses.unshift(analysis);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analyses.slice(0, MAX_ANALYSES)));
  }
}

export const jobAnalysisStore: JobAnalysisStore = new LocalStorageJobAnalysisStore();
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/jobAnalysisStore.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/types/jobFit.ts frontend/src/lib/resumeStore.ts frontend/src/lib/jobAnalysisStore.ts frontend/src/lib/resumeStore.test.ts frontend/src/lib/jobAnalysisStore.test.ts
git commit -m "feat(job-fit): add resume and job analysis localStorage stores"
```

---

### Task 8: Frontend — Job Fit page skeleton, nav entry, and resume library UI

**Files:**
- Create: `frontend/src/pages/JobFit.tsx`
- Create: `frontend/src/lib/resumeFromExtraction.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Index.tsx`

**Interfaces:**
- Consumes: `resumeStore` (Task 7), `extractTextFromFile` from `@/lib/fileTextExtractor`, `DEFAULT_PROFILE` from `@/lib/profile`, existing shadcn components (`Button`, `Badge`, `Input`).
- Produces: `buildProfileFromExtraction(extracted): CandidateProfile` helper; the `/job-fit` route; a `JobFit` page component with resume upload/select — consumed by Task 9, 10, 11, 12.

- [ ] **Step 1: Write the resume-from-extraction helper**

Create `frontend/src/lib/resumeFromExtraction.ts`:

```typescript
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
```

- [ ] **Step 2: Add the route**

Modify `frontend/src/App.tsx`. Add this import after `import Index from "./pages/Index";`:

```typescript
import JobFit from "./pages/JobFit";
```

Add this route inside `<Routes>`, before the `path="*"` catch-all:

```typescript
<Route path="/job-fit" element={<JobFit />} />
```

- [ ] **Step 3: Add a nav entry on the Index page**

Modify `frontend/src/pages/Index.tsx`. Add this import after `import { useTheme } from "next-themes";`:

```typescript
import { useNavigate } from "react-router-dom";
```

Add `Target` to the existing `lucide-react` import list (alongside `Download, Sparkles, ...`).

Inside the `Index` component, after the line `const { theme, setTheme } = useTheme();`, add:

```typescript
const navigate = useNavigate();
```

In the header's button row (right after the `Profile` button's closing `</Button>` and before the `Instructions` button), add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => navigate("/job-fit")}
  className="gap-2"
>
  <Target className="h-4 w-4" />
  Job Fit
</Button>
```

- [ ] **Step 4: Write the Job Fit page skeleton with resume library**

Create `frontend/src/pages/JobFit.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Loader2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { extractTextFromFile } from "@/lib/fileTextExtractor";
import { buildProfileFromExtraction } from "@/lib/resumeFromExtraction";
import { resumeStore, MAX_RESUMES } from "@/lib/resumeStore";
import type { ResumeRecord } from "@/types/jobFit";

const API_URL = import.meta.env.VITE_API_URL || "";

const JobFit = () => {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setResumes(resumeStore.list());
  }, []);

  const selectedResume = resumes.find((r) => r.id === selectedResumeId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (resumeStore.list().length >= MAX_RESUMES) {
      toast.error(`Resume library is full (max ${MAX_RESUMES}). Delete one first.`);
      return;
    }

    setIsUploading(true);
    try {
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length < 20) {
        throw new Error("Could not extract enough text from this file. Try a different format.");
      }

      const extractResp = await fetch(`${API_URL}/api/profile/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 15000) }),
      });
      if (!extractResp.ok) {
        const err = await extractResp.json().catch(() => ({}));
        throw new Error(err.error || "AI extraction failed");
      }
      const extracted = await extractResp.json();
      const profile = buildProfileFromExtraction(extracted);

      const resume: ResumeRecord = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        profile,
        raw_text: text,
        source: "upload",
        created_at: new Date().toISOString(),
      };

      resumeStore.save(resume);
      setResumes(resumeStore.list());
      setSelectedResumeId(resume.id);
      toast.success("Resume added to your library.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to process resume");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteResume = (id: string) => {
    resumeStore.remove(id);
    setResumes(resumeStore.list());
    if (selectedResumeId === id) setSelectedResumeId(undefined);
    toast.success("Resume removed");
  };

  return (
    <div className="min-h-screen bg-background transition-colors">
      <header className="border-b border-border/50 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Job Fit
            </h1>
            <p className="text-xs text-muted-foreground">
              See how your resume matches a role, and close the gaps.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Your Resumes</h3>
            <label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button asChild variant="outline" size="sm" className="gap-2" disabled={isUploading}>
                <span>
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Resume
                </span>
              </Button>
            </label>
          </div>

          {resumes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground/70">
              Upload a resume (PDF, DOCX, or TXT) to get started.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {resumes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedResumeId(r.id)}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
                    selectedResumeId === r.id
                      ? "border-accent bg-accent/10"
                      : "border-border/60 bg-background hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                    {r.source === "optimized" && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Optimized
                      </Badge>
                    )}
                  </div>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteResume(r.id);
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedResume && (
          <p className="mt-4 text-sm text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selectedResume.name}</span>
          </p>
        )}
      </main>
    </div>
  );
};

export default JobFit;
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (from repo root)
Open `http://localhost:8080`, click the new "Job Fit" button in the header, confirm the Job Fit page loads, upload a resume file, and confirm it appears in the library and can be selected/deleted.

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/JobFit.tsx frontend/src/lib/resumeFromExtraction.ts frontend/src/App.tsx frontend/src/pages/Index.tsx
git commit -m "feat(job-fit): add Job Fit page skeleton with resume library"
```

---

### Task 9: Frontend — Job posting input and Analyze action

**Files:**
- Modify: `frontend/src/pages/JobFit.tsx`

**Interfaces:**
- Consumes: `jobAnalysisStore` (Task 7), `MatchAnalysisApiResponse` (Task 7), `POST /api/job/match` (Task 5).
- Produces: `analysis: MatchAnalysisApiResponse | null` state and `handleAnalyze` handler — consumed by Task 10.

- [ ] **Step 1: Add job posting input and Analyze action**

Modify `frontend/src/pages/JobFit.tsx`. Add these imports:

```typescript
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { jobAnalysisStore } from "@/lib/jobAnalysisStore";
import type { MatchAnalysisApiResponse, JobAnalysisRecord } from "@/types/jobFit";
```

(Add `Sparkles` into the existing `lucide-react` import instead of a separate line if preferred — keep one import statement.)

Add this state after `const [isUploading, setIsUploading] = useState(false);`:

```typescript
const [jobPosting, setJobPosting] = useState("");
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analysis, setAnalysis] = useState<MatchAnalysisApiResponse | null>(null);
```

Add this handler after `handleDeleteResume`:

```typescript
const handleAnalyze = async () => {
  if (!selectedResume) {
    toast.error("Select or upload a resume first.");
    return;
  }
  if (!jobPosting.trim()) {
    toast.error("Paste a job posting first.");
    return;
  }

  setIsAnalyzing(true);
  setAnalysis(null);
  try {
    const { experiences, projects, education, ...profileRest } = selectedResume.profile;
    const primaryEdu = education[0];

    const resp = await fetch(`${API_URL}/api/job/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_profile: {
          ...profileRest,
          experiences: experiences.map(({ id: _id, ...rest }) => rest),
          projects: projects.map(({ id: _id, ...rest }) => rest),
          ...(primaryEdu?.programme && { programme: primaryEdu.programme }),
          ...(primaryEdu?.university && { university: primaryEdu.university }),
          ...(primaryEdu?.degree_year && { degree_year: primaryEdu.degree_year }),
        },
        job_posting: jobPosting,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || "Analysis failed, try again.");
    }

    const result = data as MatchAnalysisApiResponse;
    setAnalysis(result);

    const record: JobAnalysisRecord = {
      ...result,
      id: crypto.randomUUID(),
      resume_id: selectedResume.id,
      job_posting_text: jobPosting,
      created_at: new Date().toISOString(),
    };
    jobAnalysisStore.save(record);

    toast.success("Match analysis complete.");
  } catch (err) {
    console.error(err);
    toast.error(err instanceof Error ? err.message : "Analysis failed");
  } finally {
    setIsAnalyzing(false);
  }
};
```

Add this block inside `<main>`, right after the closing `</div>` of the resume-library `rounded-xl border ...` block (before the `{selectedResume && ...}` paragraph, which can now be removed since the job posting section replaces it):

```tsx
{selectedResume && (
  <div className="mt-4 flex flex-col gap-3">
    <label className="text-sm font-medium text-foreground">Job Posting</label>
    <Textarea
      placeholder="Paste the full job posting here."
      className="h-[220px] resize-none border-border bg-card font-body text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:ring-accent"
      value={jobPosting}
      onChange={(e) => setJobPosting(e.target.value)}
    />
    <Button
      onClick={handleAnalyze}
      disabled={isAnalyzing || !jobPosting.trim()}
      className="gap-3 self-start bg-accent text-accent-foreground hover:bg-accent/90 font-semibold h-12 rounded-xl"
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing match...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Analyze
        </>
      )}
    </Button>
  </div>
)}
```

Remove the now-redundant `{selectedResume && (<p ...>Selected: ...</p>)}` block from Task 8's Step 4.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, navigate to Job Fit, select an uploaded resume, paste a real job posting (120+ words), click Analyze, and confirm a network request to `/api/job/match` succeeds (check the Network tab) and no console errors appear. (The results are not rendered yet — that's Task 10 — but `analysis` state should be populated; verify with a temporary `console.log(analysis)` if needed, then remove it.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/JobFit.tsx
git commit -m "feat(job-fit): add job posting input and analyze action"
```

---

### Task 10: Frontend — Match Results panel

**Files:**
- Create: `frontend/src/components/jobfit/MatchResultsPanel.tsx`
- Modify: `frontend/src/pages/JobFit.tsx`

**Interfaces:**
- Consumes: `MatchAnalysisApiResponse` (Task 7).
- Produces: `<MatchResultsPanel analysis={...} />` component — consumed by Task 11 (Optimize button lives in this panel's actions row) and Task 12 (Generate Cover Letter button).

- [ ] **Step 1: Write the Match Results panel component**

Create `frontend/src/components/jobfit/MatchResultsPanel.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle } from "lucide-react";
import type { MatchAnalysisApiResponse, CategoryScores } from "@/types/jobFit";

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  skills: "Skills",
  experience: "Experience",
  keywords: "Keywords",
  education: "Education",
  technologies: "Technologies",
};

function scoreBadgeClass(score: number): string {
  if (score >= 90) return "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/50 dark:text-green-200";
  if (score >= 60) return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200";
  return "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200";
}

interface MatchResultsPanelProps {
  analysis: MatchAnalysisApiResponse;
  actions?: React.ReactNode;
}

export function MatchResultsPanel({ analysis, actions }: MatchResultsPanelProps) {
  const isHighMatch = analysis.overall_score >= 90;
  const totalRequirements =
    analysis.matched_requirements.length + analysis.missing_requirements.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {analysis.parsed_job.role_title} at {analysis.parsed_job.company_name}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {isHighMatch ? "Excellent match" : "Overall Match"}
          </p>
        </div>
        <div className={`rounded-full border px-4 py-1.5 text-2xl font-bold ${scoreBadgeClass(analysis.overall_score)}`}>
          {analysis.overall_score}%
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/50 bg-card p-4 sm:grid-cols-2">
        {(Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[]).map((cat) => (
          <div key={cat}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
              <span className="font-medium text-foreground">{analysis.category_scores[cat]}%</span>
            </div>
            <Progress value={analysis.category_scores[cat]} className="h-2" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Requirements Coverage</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Overall Match</dt>
            <dd className="font-medium text-foreground">{analysis.overall_score}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Matched Requirements</dt>
            <dd className="font-medium text-foreground">
              {analysis.matched_requirements.length} / {totalRequirements}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {isHighMatch ? "Critical Missing Skills (minor)" : "Critical Missing Skills"}
            </dt>
            <dd className="font-medium text-foreground">
              {analysis.critical_missing_skills.length > 0
                ? analysis.critical_missing_skills.join(", ")
                : "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {isHighMatch ? "Polish Suggestions" : "Resume Weaknesses"}
            </dt>
            <dd className="font-medium text-foreground">
              {analysis.weaknesses.length > 0 ? analysis.weaknesses.join("; ") : "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Estimated ATS Ranking</dt>
            <dd className="font-medium text-foreground">{analysis.estimated_ranking_band}</dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Matched</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.matched_requirements.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Missing</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.missing_requirements.map((r) => (
                <Badge key={r} variant="outline" className="gap-1 text-xs">
                  <XCircle className="h-3 w-3 text-muted-foreground" />
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {analysis.strengths.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Strengths</h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {analysis.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Render the panel in JobFit.tsx**

Modify `frontend/src/pages/JobFit.tsx`. Add this import:

```typescript
import { MatchResultsPanel } from "@/components/jobfit/MatchResultsPanel";
```

Add this block inside `<main>`, right after the job-posting/Analyze block from Task 9:

```tsx
{analysis && (
  <div className="mt-6">
    <MatchResultsPanel analysis={analysis} />
  </div>
)}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, repeat the Task 9 verification flow, and confirm the results screen now renders: overall score badge, category meters, Requirements Coverage panel with matched/missing counts, and strengths list.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobfit/MatchResultsPanel.tsx frontend/src/pages/JobFit.tsx
git commit -m "feat(job-fit): render match results and requirements coverage panel"
```

---

### Task 11: Frontend — Optimize Resume flow

**Files:**
- Create: `frontend/src/components/jobfit/OptimizeResumeDialog.tsx`
- Modify: `frontend/src/pages/JobFit.tsx`

**Interfaces:**
- Consumes: `MatchAnalysisApiResponse` (Task 7), `resumeStore` (Task 7), `POST /api/resume/optimize` (Task 6).
- Produces: `<OptimizeResumeDialog />` — a confirm-before-save diff dialog that calls `resumeStore.save()` with a new `source: "optimized"` record.

- [ ] **Step 1: Write the Optimize Resume dialog**

Create `frontend/src/components/jobfit/OptimizeResumeDialog.tsx`:

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { resumeStore } from "@/lib/resumeStore";
import type { ResumeRecord, MatchAnalysisApiResponse } from "@/types/jobFit";

const API_URL = import.meta.env.VITE_API_URL || "";

interface OptimizeResumeDialogProps {
  resume: ResumeRecord;
  analysis: MatchAnalysisApiResponse;
  analysisId: string;
  onOptimized: (resume: ResumeRecord) => void;
}

export function OptimizeResumeDialog({
  resume,
  analysis,
  analysisId,
  onOptimized,
}: OptimizeResumeDialogProps) {
  const [open, setOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedProfile, setOptimizedProfile] = useState<ResumeRecord["profile"] | null>(null);

  const isHighMatch = analysis.overall_score >= 90;

  const handleOpen = async () => {
    setOpen(true);
    setOptimizedProfile(null);
    setIsOptimizing(true);
    try {
      const { experiences, projects, education, ...profileRest } = resume.profile;
      const primaryEdu = education[0];

      const resp = await fetch(`${API_URL}/api/resume/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_profile: {
            ...profileRest,
            experiences: experiences.map(({ id: _id, ...rest }) => rest),
            projects: projects.map(({ id: _id, ...rest }) => rest),
            ...(primaryEdu?.programme && { programme: primaryEdu.programme }),
            ...(primaryEdu?.university && { university: primaryEdu.university }),
            ...(primaryEdu?.degree_year && { degree_year: primaryEdu.degree_year }),
          },
          job_analysis: {
            matched_requirements: analysis.matched_requirements,
            missing_requirements: analysis.missing_requirements,
            critical_missing_skills: analysis.critical_missing_skills,
            weaknesses: analysis.weaknesses,
          },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Optimization failed");

      const optimized = data.optimized_profile;
      setOptimizedProfile({
        ...resume.profile,
        name: optimized.name,
        email: optimized.email,
        phone: optimized.phone,
        location: optimized.location,
        skills: optimized.skills,
        experiences: optimized.experiences.map((e: Omit<ResumeRecord["profile"]["experiences"][number], "id">) => ({
          ...e,
          id: crypto.randomUUID(),
        })),
        projects: optimized.projects.map((p: Omit<ResumeRecord["profile"]["projects"][number], "id">) => ({
          ...p,
          id: crypto.randomUUID(),
        })),
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Optimization failed");
      setOpen(false);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleConfirmSave = () => {
    if (!optimizedProfile) return;
    const newResume: ResumeRecord = {
      id: crypto.randomUUID(),
      name: `${resume.name} (Optimized)`,
      profile: optimizedProfile,
      raw_text: resume.raw_text,
      source: "optimized",
      parent_resume_id: resume.id,
      job_analysis_id: analysisId,
      created_at: new Date().toISOString(),
    };
    resumeStore.save(newResume);
    onOptimized(newResume);
    setOpen(false);
    toast.success("Optimized resume saved to your library.");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-2">
        <Wand2 className="h-4 w-4" />
        {isHighMatch ? "Fine-tune resume" : "Optimize Resume"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isHighMatch ? "Fine-tune Resume" : "Optimize Resume"}</DialogTitle>
          </DialogHeader>

          {isOptimizing ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rewriting resume content...
            </div>
          ) : optimizedProfile ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Original</p>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-foreground">
                  <p className="font-medium">Skills</p>
                  <p className="mb-2 text-muted-foreground">{resume.profile.skills.join(", ")}</p>
                  {resume.profile.experiences.map((e) => (
                    <div key={e.id} className="mb-2">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-muted-foreground">{e.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-accent">Optimized</p>
                <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs text-foreground">
                  <p className="font-medium">Skills</p>
                  <p className="mb-2 text-muted-foreground">{optimizedProfile.skills.join(", ")}</p>
                  {optimizedProfile.experiences.map((e) => (
                    <div key={e.id} className="mb-2">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-muted-foreground">{e.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={!optimizedProfile || isOptimizing}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Save as new resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire it into JobFit.tsx**

Modify `frontend/src/pages/JobFit.tsx`. Add this import:

```typescript
import { OptimizeResumeDialog } from "@/components/jobfit/OptimizeResumeDialog";
```

Track the latest saved `JobAnalysisRecord` id. Change the `analysis` state block from Task 9 to also store the record id:

```typescript
const [analysisRecord, setAnalysisRecord] = useState<JobAnalysisRecord | null>(null);
```

In `handleAnalyze`, after `jobAnalysisStore.save(record);`, add:

```typescript
setAnalysisRecord(record);
```

Replace the `{analysis && (...)}` block from Task 10 Step 2 with:

```tsx
{analysis && analysisRecord && selectedResume && (
  <div className="mt-6">
    <MatchResultsPanel
      analysis={analysis}
      actions={
        <OptimizeResumeDialog
          resume={selectedResume}
          analysis={analysis}
          analysisId={analysisRecord.id}
          onOptimized={(newResume) => {
            setResumes(resumeStore.list());
            setSelectedResumeId(newResume.id);
          }}
        />
      }
    />
  </div>
)}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, run an analysis, click "Optimize Resume" (or "Fine-tune resume" on a ≥90% match), confirm the diff dialog loads with original vs. optimized content, click "Save as new resume", and confirm a new "(Optimized)" entry appears in the resume library and is auto-selected. Confirm the original resume is unchanged in the library.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobfit/OptimizeResumeDialog.tsx frontend/src/pages/JobFit.tsx
git commit -m "feat(job-fit): add optimize resume diff dialog and save flow"
```

---

### Task 12: Frontend — Generate Cover Letter handoff

**Files:**
- Modify: `frontend/src/pages/JobFit.tsx`
- Modify: `frontend/src/pages/Index.tsx`

**Interfaces:**
- Consumes: `react-router-dom`'s `useNavigate`/`useLocation`, `saveProfile` from `@/lib/profile`.
- Produces: a "Generate Cover Letter" action in `MatchResultsPanel`'s `actions` slot that navigates to `/` with router state, and `Index.tsx` logic that consumes that state on mount.

- [ ] **Step 1: Add the Generate Cover Letter button in JobFit.tsx**

Modify `frontend/src/pages/JobFit.tsx`. Add `FileEdit` to the `lucide-react` import.

In the `actions` prop passed to `MatchResultsPanel` (from Task 11 Step 2), add a second button alongside `OptimizeResumeDialog`:

```tsx
actions={
  <>
    <OptimizeResumeDialog
      resume={selectedResume}
      analysis={analysis}
      analysisId={analysisRecord.id}
      onOptimized={(newResume) => {
        setResumes(resumeStore.list());
        setSelectedResumeId(newResume.id);
      }}
    />
    <Button
      onClick={() =>
        navigate("/", {
          state: { profile: selectedResume.profile, jobPosting },
        })
      }
      className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
    >
      <FileEdit className="h-4 w-4" />
      Generate Cover Letter
    </Button>
  </>
}
```

- [ ] **Step 2: Consume the handoff state in Index.tsx**

Modify `frontend/src/pages/Index.tsx`. Add this import:

```typescript
import { useLocation, useNavigate } from "react-router-dom";
```

(This replaces the standalone `useNavigate` import added in Task 8 Step 3 — combine into one import line.)

Add this inside the `Index` component, after `const navigate = useNavigate();`:

```typescript
const location = useLocation();
```

Modify the existing mount `useEffect` (the one currently reading `setHistory(loadHistory()); setProfile(loadProfile()); setInstructions(loadInstructions());`) to:

```typescript
useEffect(() => {
  setHistory(loadHistory());
  setInstructions(loadInstructions());

  const handoffState = location.state as
    | { profile?: CandidateProfile; jobPosting?: string }
    | null;

  if (handoffState?.profile) {
    saveProfile(handoffState.profile);
    setProfile(handoffState.profile);
    if (handoffState.jobPosting) {
      setJobPostingInput(handoffState.jobPosting, false);
    }
    toast.success("Loaded profile and job posting from Job Fit.");
    navigate(".", { replace: true, state: null });
  } else {
    setProfile(loadProfile());
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

`saveProfile` is already imported from `@/lib/profile` in this file. `setJobPostingInput` is declared further down in the component as a `const`; since it is used here before its declaration in reading order but both are inside the same function body and `const` functions are only invoked after render (inside the effect callback, which runs after the whole function body has executed), this is safe — no reordering needed.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, go through the full flow: Job Fit → select resume → paste job posting → Analyze → Generate Cover Letter. Confirm it navigates to `/`, the profile is now the Job Fit resume's profile, the job posting textarea is pre-filled, and clicking "Generate Cover Letter" on that page produces a letter as before.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Run the full backend test suite one more time (final regression check)**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/JobFit.tsx frontend/src/pages/Index.tsx
git commit -m "feat(job-fit): hand off resume and job posting to cover letter generator"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-26-job-fit-design.md` maps to a task — user flow (Tasks 8-12), data model/storage (Task 7), scoring pipeline (Tasks 2-5), optimize endpoint (Task 6), UI/results screen (Task 10), high-match handling (Task 10's `isHighMatch` branch), optimize flow with diff+confirm (Task 11), cover letter handoff (Task 12), edge cases (resume cap enforced in Task 8/9, empty-text guard in Task 8, error handling via existing Zod+try/catch pattern in Tasks 5-6), testing (unit tests in Tasks 2-7, manual verification in Tasks 8-12).
- **Type consistency:** `ResumeRecord`, `JobAnalysisRecord`, `MatchAnalysisApiResponse`, `CategoryScores` are defined once in Task 7 and reused verbatim by name in every later frontend task; backend `CategorizedRequirement`, `CoverageResult`, `MatchNarrative`, `MatchAnalysisResponse` are defined once in Task 1 and reused verbatim by name in Tasks 2-6.
- **No placeholders:** all steps include complete, runnable code; no TODO/TBD markers remain.
