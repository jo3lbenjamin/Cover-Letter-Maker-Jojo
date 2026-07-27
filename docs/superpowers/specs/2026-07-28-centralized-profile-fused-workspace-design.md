# Centralized Profile & Fused Job Fit / Cover Letter Workspace

## Problem

Resume upload is duplicated across the app with no shared state:

- **Cover-letter generator** (`Index.tsx` / `ProfileEditor.tsx`) stores a single `CandidateProfile` in `localStorage` under `covercraft-profile`.
- **Job Fit** (`JobFit.tsx`) stores an independent library of up to 20 `ResumeRecord`s under `covercraft-resumes`, each with its own uploaded resume.
- Both components implement nearly identical client-side upload/extract logic (`handleFileUpload`, calling `/api/profile/extract`), duplicated rather than shared.
- The only connection between the two is a one-way, manual handoff: Job Fit's "Generate Cover Letter" button passes a resume via React Router state, and the cover-letter page asks the user to confirm overwriting their profile with it. There is no reverse flow, and uploading a resume in one place never appears in the other.
- Job Fit and Cover Letter Maker are also separate pages/routes today, requiring navigation back and forth to analyze a job and then write a letter for it.

## Goals

1. One resume/profile, uploaded once, used everywhere — no duplicated upload flows, no manual handoff.
2. Fuse Job Fit and Cover Letter Maker into a single workspace so analyzing a job and writing its cover letter happen in one place, side by side.

## Non-goals (explicitly out of scope for this design)

- Multiple saved resume variants (e.g. "Frontend-focused" vs "Backend-focused") — deferred to a possible future resume-editor project.
- A saved/browsable list of past analyzed jobs — only one active job exists at a time.
- Migrating existing users' data from the old `covercraft-resumes` / job-analysis localStorage keys — this is a low-traffic, account-less, localStorage-only app; old keys are simply left unread.
- Any change to the currently-unused backend `/api/documents/*` routes.
- Any change to the existing cover-letter history feature (`SavedCoverLetter` / `HistoryPanel`) — it is separate from job analysis history and is unaffected.

## Architecture

A single combined page (replacing the separate `/` and `/jobfit` routes) with three parts:

- **Icon rail** (slim, fixed left): profile avatar (opens the profile sheet) and a settings/theme icon. No navigation tabs, no jobs list — there is one screen.
- **Workspace** (main area, side-by-side split):
  - Left panel: job posting input → match analysis.
  - Right panel: cover letter draft.
  - Both panels operate on the same active job posting and the one canonical profile.
- **Profile sheet** (slide-out from the rail avatar): the single place to upload/edit the resume and supporting documents ("My Documents"). Every other part of the app only reads from this profile — nothing else uploads or stores its own copy.

There is exactly one active job at a time. Pasting a new job posting replaces the current one; there is no list of past jobs to browse.

## Data Model

- **`CandidateProfile`** remains the canonical shape (name, contact info, skills, experiences, projects, education), stored under the existing `covercraft-profile` localStorage key. This becomes the single source of truth used by both match analysis and cover-letter generation.
- **Removed**: `ResumeRecord` and `frontend/src/lib/resumeStore.ts` (Job Fit's multi-resume library) — no longer needed with one canonical profile.
- **Removed**: `JobAnalysisRecord` and `frontend/src/lib/jobAnalysisStore.ts` (job analysis history) — no longer needed with no saved jobs list.
- **Unchanged**: `UploadedDocument` / `frontend/src/lib/documents.ts` ("My Documents" — portfolios, transcripts, etc.) — still lives in the profile sheet, still feeds `document_texts` into cover-letter generation.
- **New, not persisted**: an in-memory "active job" state shape held by the fused page, e.g. `{ job_posting: string, match_analysis?: MatchAnalysisApiResponse, optimize_context?: ... }`. Cleared/replaced when a new job posting is entered; not written to localStorage, so it does not survive a page refresh (the profile does).
- The upload → client-side extract → `POST /api/profile/extract` → merge-into-`CandidateProfile` flow is implemented once, in the profile sheet, and used nowhere else (removing the duplicated `handleFileUpload` in both `ProfileEditor.tsx` and `JobFit.tsx`).

## Workspace Behavior

- **Left panel (match analysis)**: paste/edit job posting text, "Analyze" calls `POST /api/job/match` with the canonical profile, renders match score/gaps using the existing `MatchResultsPanel` rendering logic.
- **Right panel (cover letter)**: "Generate Cover Letter" calls `POST /api/cover-letter` using the canonical profile plus the active job posting text, and any accepted optimize suggestions as extra generation context.
- **Optimize flow**: replaces `OptimizeResumeDialog`'s "save a new resume variant" behavior. Suggestions surfaced from the match analysis (gaps, phrasing, keywords) are fed into cover-letter generation as context for that job only — the canonical profile is never modified, and nothing is persisted as a separate resume version.
- **Empty/incomplete profile state**: if `isProfileComplete()` is false, both panels show a prompt to open the profile sheet first; analysis and generation are disabled until the profile meets the existing completeness bar (name, email, location, phone), rather than allowing API calls to fail.
- **Removed**: the cross-page handoff (`navigate("/", { state: { profile } })`) and its "load resume from Job Fit? this will overwrite your profile" confirm dialog in `Index.tsx` — unnecessary once there is only one page and one profile.

## Backend Changes

- **Unchanged**: `POST /api/profile/extract`, `POST /api/job/match`, `POST /api/cover-letter`.
- **Removed**: `POST /api/resume/optimize` and `backend/src/services/resumeOptimizer.ts` — optimization no longer produces a saved variant. The match-analysis gaps/keywords already returned by `POST /api/job/match` are passed directly into the existing `POST /api/cover-letter` request as extra generation context; no separate "optimize" endpoint is needed.
- **Untouched**: `/api/documents/*` (upload/list/get) — already unused by the frontend, orthogonal to this change.
- No database changes — the backend remains stateless/in-memory (fits its serverless deployment); all persistence stays client-side in `localStorage`.

## Error Handling & Edge Cases

- Incomplete profile disables analysis/generation with an inline prompt, rather than surfacing API failures.
- Extraction failures (unparseable file, empty/too-short text) keep the existing toast-based error handling, now centralized to one code path instead of two duplicated ones.
- The active job is not persisted; refreshing the page clears it (the profile survives). The UI should give a subtle "unsaved" hint so this isn't surprising, but no auto-save mechanism is built.
- Old localStorage keys (`covercraft-resumes`, job-analysis history) are left in place, unread by new code — no active migration or cleanup performed.

## Removed Components/Files (as part of this change)

- `frontend/src/pages/JobFit.tsx` (folded into the fused workspace page)
- `frontend/src/components/jobfit/OptimizeResumeDialog.tsx` (replaced by inline optimize-context flow)
- `frontend/src/lib/resumeStore.ts`
- `frontend/src/lib/jobAnalysisStore.ts`
- `frontend/src/types/jobFit.ts` types tied to `ResumeRecord`/`JobAnalysisRecord` (keep any types still needed for match analysis responses)
- `backend/src/routes/resume.ts`, `backend/src/services/resumeOptimizer.ts`
- The Job-Fit-to-cover-letter handoff code in `frontend/src/pages/Index.tsx` (router-state confirm dialog)

`frontend/src/components/jobfit/MatchResultsPanel.tsx` and `frontend/src/components/ProfileEditor.tsx` are retained and adapted (the latter becomes the profile-sheet content).

## Testing

- Unit-level coverage for the shared upload/extract module: profile-completeness gating, extraction error paths.
- Manual in-browser verification: upload a resume once via the profile sheet; confirm it's immediately usable for both match analysis and cover-letter generation with no re-upload; confirm removed components/files have no remaining imports/references after deletion.
