# Job Fit — AI Job Application Assistant Design

**Status:** Approved for planning
**Date:** 2026-07-26

## Summary

Expand CoverCraft from a single-purpose cover letter generator into a fuller job application assistant. Users upload a resume, paste a job posting, and get an ATS Match Score broken down by category (Skills, Experience, Keywords, Education, Technologies), a Requirements Coverage panel showing exactly what matched and what didn't, and an optional AI-optimized resume — all without fabricating experience. The flow ends by handing off into the existing cover letter generator.

This integrates as a new top-level page ("Job Fit") alongside the existing generator, not a separate product.

## Goals

- Give users a trustworthy, explainable match score — not just a single opaque percentage.
- Let users save multiple resumes and generate optimized, job-specific versions without losing the original.
- Reuse existing infrastructure (client-side extraction, profile extraction pipeline, job parsing pipeline, cover letter generator) rather than duplicating it.
- Keep the backend stateless, consistent with the app's current architecture.

## Non-goals

- Real ATS system simulation/certification — the score is a helpful estimate, not a guarantee of how any specific employer's ATS will rank the resume.
- Cross-device sync or user accounts (see Storage section — designed to allow this later, not built now).
- Live/real-time score updates as the user types (see User Flow — explicitly a discrete "Analyze" action).

## User Flow

1. User opens **Job Fit**, selects an existing saved resume or uploads a new one (PDF/DOCX/TXT). Files are extracted entirely client-side (reusing `frontend/src/lib/fileTextExtractor.ts`), consistent with the app's existing "files never leave the browser" principle — only extracted text is sent to the backend.
2. On upload, the extracted text runs through the existing `/api/profile/extract` pipeline to populate/update a `CandidateProfile`. The resume *is* the profile — it's saved to the user's resume library under a user-given name (e.g. "Backend Resume").
3. User pastes or fetches (existing `/api/job/fetch`) a job posting.
4. User clicks **Analyze**. The backend runs a two-stage hybrid pipeline (see Scoring Pipeline) and returns the score + coverage breakdown.
5. Results screen shows: Overall Match %, per-category breakdown, the Requirements Coverage panel, strengths, and (if below a high-match threshold) weaknesses/gaps.
6. User may click **Optimize Resume**: the LLM rewrites resume content to close gaps, grounded only in facts already present in the profile (no fabrication). User reviews a side-by-side diff of original vs. optimized content and confirms before it's saved as a new, separate resume version linked to this job analysis. The original resume is never overwritten.
7. From the results screen, **Generate Cover Letter** navigates to the existing generator, pre-loaded with the chosen (optimized or original) profile and the job posting — reusing the existing generation flow unchanged.

## Data Model & Storage

**Storage strategy:** hybrid. A thin storage-abstraction interface (`frontend/src/lib/resumeStore.ts`) is implemented against `localStorage` today, following the same pattern as the existing `lib/profile.ts` / `lib/documents.ts` modules. Feature code depends only on the interface, so a backend-database implementation can replace it later without touching UI or pipeline code. The backend itself remains stateless — no new server-side persistence is introduced.

**`covercraft-resumes`** — array of `ResumeRecord`:

```ts
interface ResumeRecord {
  id: string;
  name: string;                 // user-given label, e.g. "Backend Resume"
  profile: CandidateProfile;    // structured, from /api/profile/extract
  raw_text: string;             // original extracted text
  source: "upload" | "optimized";
  parent_resume_id?: string;    // set when source === "optimized"
  job_analysis_id?: string;     // links optimized resume to the analysis that produced it
  created_at: string;
}
```

**`covercraft-job-analyses`** — array of `JobAnalysisRecord`:

```ts
interface JobAnalysisRecord {
  id: string;
  resume_id: string;
  job_posting_text: string;
  parsed_job: ParsedJobPosting;   // existing type, extended with per-requirement category tags
  overall_score: number;
  category_scores: {
    skills: number;
    experience: number;
    keywords: number;
    education: number;
    technologies: number;
  };
  matched_requirements: string[];
  missing_requirements: string[];
  critical_missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  estimated_ranking_band: string;  // qualitative, e.g. "Strong candidate (Top 20–30%)"
  created_at: string;
}
```

**Limits:** resume library capped at 20 saved resumes (mirroring the existing 50-entry cap on cover letter history); oldest unused resumes prompt for deletion when the cap is hit.

## Scoring Pipeline

Two-stage hybrid pipeline in a new `backend/src/services/matchAnalyzer.ts`, exposed via `POST /api/job/match`.

**Stage 1 — Deterministic coverage (no LLM):**

- Extend `parseJobPosting` (`backend/src/services/jobParser.ts`) to return a larger, categorized requirement list — each requirement tagged with one of `skills | experience | keywords | education | technologies` (currently capped at 8 generic, uncategorized requirements).
- For each requirement, check for a match against the candidate profile (skills array, experience descriptions/outcomes, degree/programme fields) using normalized substring + fuzzy token overlap — generalizing the matching logic already used in `coverLetterGenerator.ts`'s `chosenSkills` filter.
- Compute `matched_requirements`, `missing_requirements`, a percentage per category, and `overall_score` as a weighted average across categories.
- This stage is a pure function, independent of the LLM, and is the part of the pipeline responsible for the numbers shown in the Requirements Coverage panel (e.g. "18 / 24 matched") — these are real counts, not model estimates.

**Stage 2 — LLM narrative (grounded in Stage 1 output):**

- One `chatCompletion` call, given the profile plus Stage 1's matched/missing lists (not the raw job text alone), returns:
  - `strengths` (3–5 items)
  - `weaknesses` (specific and actionable, e.g. "bullet points lack measurable outcomes")
  - `critical_missing_skills` (the subset of missing requirements the model judges most important)
  - `estimated_ranking_band` — a qualitative label only ("Strong candidate", "Competitive", "Needs improvement"), explicitly not a numeric percentile, to avoid implying false precision
- New Zod-validated request/response types, following the existing pattern in `backend/src/prompts/jobParsing.ts` and `profileExtraction.ts`.

**`POST /api/job/match`**

```typescript
// Request
{ candidate_profile: CandidateProfile; job_posting: string }

// Response
{
  parsed_job: ParsedJobPosting;
  overall_score: number;
  category_scores: { skills, experience, keywords, education, technologies: number };
  matched_requirements: string[];
  missing_requirements: string[];
  critical_missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  estimated_ranking_band: string;
}
```

**`POST /api/resume/optimize`**

```typescript
// Request
{ candidate_profile: CandidateProfile; job_analysis: MatchAnalysisResponse }

// Response
{ optimized_profile: CandidateProfile }
```

The optimize prompt rewrites bullet points/skills phrasing to close identified gaps, using only facts already present in the input profile — the system prompt explicitly forbids introducing new employers, skills, or outcomes not already present, mirroring the existing "no invented facts" constraint in the cover letter system prompt.

## UI — Results Screen

Single page, top to bottom:

1. **Header bar** — resume name used, job title/company (from `parsed_job`), overall score as a percentage with a colored badge (red <60%, amber 60–80%, green >80%).
2. **Category breakdown** — 5 meters: Skills, Experience, Keywords, Education, Technologies.
3. **Requirements Coverage panel:**
   ```
   Overall Match: 82%
   Matched Requirements: 18 / 24
   Critical Missing Skills: Docker, AWS
   Resume Weaknesses: Bullet points lack measurable outcomes
   Estimated ATS Ranking: Strong candidate (Top 20–30%)
   ```
   Individual matched/missing requirements are listed below, expandable, tagged by category.
4. **Strengths** — short bullet list.
5. **Actions row** — `Optimize Resume` and `Generate Cover Letter` buttons. Generate Cover Letter does not require optimization first.

**High-match handling (≥90% overall score):** header badge reads "Excellent match"; the weaknesses section reframes as "Polish suggestions" rather than manufacturing gaps; Optimize Resume remains available with copy changed to "Fine-tune resume."

**Optimize flow:** clicking Optimize Resume shows a side-by-side diff of original vs. optimized bullet points/skills before saving. User must confirm; nothing is silently rewritten. Confirming creates a new `ResumeRecord` with `source: "optimized"`, `parent_resume_id`, and `job_analysis_id` set.

**Cover letter handoff:** `Generate Cover Letter` navigates to the existing generator page with the chosen resume's `candidate_profile` and the job posting pre-filled via existing app state, landing exactly where the current generation flow starts. No changes to the existing generation logic.

## Edge Cases

- **No resume in library yet** — Job Fit prompts for upload before showing the job posting input; analysis cannot start without a resume.
- **Resume extraction yields empty text** (e.g. image-based PDF) — reuse the existing warning pattern from `fileTextExtractor.ts`; block analysis with a clear message instead of sending empty text to the LLM.
- **Job posting too short/vague** — if `parseJobPosting`'s categorized extension yields fewer than ~3 requirements, show a warning that the score may be unreliable rather than presenting a falsely confident number.
- **Resume library at cap (20)** — prompt to delete an unused resume before saving a new one.
- **Resume already a high match (≥90%)** — see High-match handling above; Optimize Resume still offered but framed as polish, not fabricated gap-filling.

## Error Handling

Both new endpoints (`/api/job/match`, `/api/resume/optimize`) follow the existing Zod-validation-at-the-boundary + try/catch-to-500 pattern used in `routes/coverLetter.ts`. LLM JSON-parsing failures retry once (mirroring the dash-retry pattern in `coverLetterGenerator.ts`), then surface a user-facing "analysis failed, try again" error rather than a partial/broken result.

## Testing

- **Backend unit tests:** the Stage 1 deterministic matcher, as a pure function against fixed profile/requirement fixtures — no LLM required. This is the highest-value test surface since it backs the panel's "trustworthy numbers" claim.
- **Backend integration tests:** `/api/job/match` and `/api/resume/optimize` routes via supertest with a mocked LLM response, matching the existing `coverLetter.test.ts` pattern.
- **Frontend unit tests:** the new `resumeStore.ts` CRUD module.
- **Manual verification:** results screen rendering and the cover-letter handoff flow in the browser.

## Key Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Storage | Hybrid — storage-abstraction interface over localStorage now, DB-swappable later |
| Multiple resumes | Yes, saved library |
| Optimized resume | Always a separate copy, linked to the job analysis; original untouched |
| Live vs. on-demand scoring | On-demand "Analyze" action |
| PDF/DOCX parsing | Client-side, reusing existing extraction |
| Resume ↔ profile relationship | Resume upload populates/updates the existing `CandidateProfile` |
| Navigation | New top-level "Job Fit" page |
| High-match (≥90%) handling | Show score + light polish suggestions, not manufactured gaps |
| Scoring engine | Hybrid — deterministic requirement matching + LLM narrative, grounded in Stage 1 output |
