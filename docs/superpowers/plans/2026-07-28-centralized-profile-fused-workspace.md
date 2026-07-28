# Centralized Profile & Fused Job Fit / Cover Letter Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's two duplicated resume-upload/storage systems (the single `CandidateProfile` used by the cover-letter generator, and Job Fit's separate multi-resume library) with one canonical profile, and fuse the Job Fit and Cover Letter Maker pages into a single side-by-side workspace behind a slim icon rail.

**Architecture:** One route (`/`) renders `Index.tsx` as an orchestrator holding all page state (profile, job posting, match analysis, cover letter, history). It renders a persistent `IconRail` (profile/instructions/history/theme) plus a two-panel workspace: `JobFitPanel` (job posting input + match analysis, left) and `CoverLetterPanel` (generation + editing + downloads, right), both fed from the same canonical profile and job posting text. Match-analysis gaps automatically flow into cover-letter generation as extra prompt context — no separate "save optimized resume" step exists anymore.

**Tech Stack:** React + TypeScript + Vite frontend (shadcn/ui, Tailwind, react-router-dom, sonner), Node/Express + Zod backend, Vitest on both sides.

## Global Constraints

- No new npm dependencies — build entirely from what's already installed (shadcn/ui components, lucide-react icons already in use).
- No backend persistence changes — the backend stays stateless/in-memory; all profile/document data remains client-side in `localStorage`.
- Follow existing code conventions: Tailwind utility classes matching surrounding style, `sonner` `toast` for user feedback, Zod schemas for backend request validation.
- Keep `npm test` passing in both `frontend/` and `backend/` after every task.
- Do not touch `/api/documents/*` routes, `frontend/src/lib/documents.ts`, `frontend/src/components/HistoryPanel.tsx`, or `frontend/src/components/InstructionsEditor.tsx` — out of scope per the design spec.

---

### Task 1: Backend — thread match-analysis gaps into cover-letter generation

**Files:**
- Modify: `backend/src/types/index.ts:90-109` (`CoverLetterRequestSchema`)
- Modify: `backend/src/prompts/coverLetter.ts:40-138` (`buildCoverLetterUserPrompt`)
- Modify: `backend/src/services/coverLetterGenerator.ts:18-79` (`generateCoverLetter`)
- Test: `backend/tests/coverLetter.test.ts`

**Interfaces:**
- Produces: `CoverLetterRequest.match_context?: { missing_requirements: string[]; critical_missing_skills: string[]; weaknesses: string[] }` — consumed by Task 8 (frontend `handleGenerate`).

- [ ] **Step 1: Write the failing test**

Add this test to `backend/tests/coverLetter.test.ts`, inside the existing `describe("Cover Letter Generation", ...)` block (after the last `it(...)`, before the closing `});`):

```ts
  it("includes match analysis gaps in the generation prompt when match_context is provided", async () => {
    mockedChat
      .mockResolvedValueOnce(MOCK_PARSED_JOB_RESPONSE)
      .mockResolvedValueOnce(MOCK_COVER_LETTER);

    await generateCoverLetter(
      makeRequest({
        match_context: {
          missing_requirements: ["AWS certification"],
          critical_missing_skills: ["Kubernetes"],
          weaknesses: ["No fintech experience"],
        },
      })
    );

    const secondCallUserPrompt = mockedChat.mock.calls[1][1] as string;
    expect(secondCallUserPrompt).toContain("AWS certification");
    expect(secondCallUserPrompt).toContain("Kubernetes");
    expect(secondCallUserPrompt).toContain("No fintech experience");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npm test -- coverLetter.test.ts`
Expected: FAIL — TypeScript error or runtime failure, because `match_context` isn't a recognized field on `CoverLetterRequest` yet and isn't included in the prompt.

- [ ] **Step 3: Add `match_context` to the request schema**

In `backend/src/types/index.ts`, inside `CoverLetterRequestSchema` (currently ends at line 109 with `system_prompt: z.string().optional(),`), add:

```ts
  system_prompt: z.string().optional(),
  match_context: z
    .object({
      missing_requirements: z.array(z.string()),
      critical_missing_skills: z.array(z.string()),
      weaknesses: z.array(z.string()),
    })
    .optional(),
});
```

(Replace the final `system_prompt: z.string().optional(),\n});` lines with the block above — same field, plus the new one before the closing `});`.)

- [ ] **Step 4: Inject the gaps into the prompt builder**

In `backend/src/prompts/coverLetter.ts`, update the `buildCoverLetterUserPrompt` param type (line 40-54) to add `matchContext`:

```ts
export function buildCoverLetterUserPrompt(params: {
  profile: CandidateProfile;
  parsedJob: ParsedJobPosting;
  jobPosting: string;
  companyContext?: string;
  tone?: "professional" | "confident" | "concise" | "story-driven" | "technical";
  priorityKeywords?: string[];
  availability: string;
  recipientName?: string;
  recipientTitle?: string;
  recipientOrg?: string;
  recipientLocation?: string;
  date: string;
  documentContext?: string;
  matchContext?: {
    missingRequirements: string[];
    criticalMissingSkills: string[];
    weaknesses: string[];
  };
}): string {
```

Destructure it alongside the other params (line 55-69, add `matchContext` to both the destructuring list and the `params` object).

Then, right after the `if (documentContext) { ... }` block (line 123-125), add:

```ts
  if (
    matchContext &&
    (matchContext.missingRequirements.length ||
      matchContext.criticalMissingSkills.length ||
      matchContext.weaknesses.length)
  ) {
    prompt += `\n\nJOB FIT GAPS TO ADDRESS (from an automated match analysis of this candidate against this job):`;
    if (matchContext.missingRequirements.length) {
      prompt += `\nMissing requirements: ${matchContext.missingRequirements.join("; ")}`;
    }
    if (matchContext.criticalMissingSkills.length) {
      prompt += `\nCritical missing skills: ${matchContext.criticalMissingSkills.join(", ")}`;
    }
    if (matchContext.weaknesses.length) {
      prompt += `\nResume weaknesses: ${matchContext.weaknesses.join("; ")}`;
    }
    prompt += `\nWhere truthful and supported by the candidate profile above, reframe relevant experience to address these gaps. Do not fabricate skills or experience the candidate does not have.`;
  }
```

- [ ] **Step 5: Pass `match_context` through the generator service**

In `backend/src/services/coverLetterGenerator.ts`, add `match_context: matchContext` to the destructuring at line 21-36:

```ts
  const {
    candidate_profile: profile,
    job_posting: jobPosting,
    company_context: companyContext,
    tone,
    priority_keywords: priorityKeywords,
    availability: availOverride,
    recipient_name: recipientName,
    recipient_title: recipientTitle,
    recipient_org: recipientOrg,
    recipient_location: recipientLocation,
    date: dateOverride,
    document_ids: documentIds,
    document_texts: documentTexts,
    system_prompt: customSystemPrompt,
    match_context: matchContext,
  } = req;
```

Then in the `buildCoverLetterUserPrompt({...})` call (line 65-79), add `matchContext` mapping the snake_case fields to camelCase:

```ts
  const userPrompt = buildCoverLetterUserPrompt({
    profile,
    parsedJob,
    jobPosting,
    companyContext,
    tone,
    priorityKeywords,
    availability,
    recipientName,
    recipientTitle,
    recipientOrg,
    recipientLocation,
    date,
    documentContext: documentContext || undefined,
    matchContext: matchContext
      ? {
          missingRequirements: matchContext.missing_requirements,
          criticalMissingSkills: matchContext.critical_missing_skills,
          weaknesses: matchContext.weaknesses,
        }
      : undefined,
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `backend/`): `npm test -- coverLetter.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/types/index.ts backend/src/prompts/coverLetter.ts backend/src/services/coverLetterGenerator.ts backend/tests/coverLetter.test.ts
git commit -m "feat: thread match-analysis gaps into cover letter generation"
```

---

### Task 2: Backend — remove the resume-optimize feature

**Files:**
- Delete: `backend/src/routes/resume.ts`
- Delete: `backend/src/services/resumeOptimizer.ts`
- Delete: `backend/src/prompts/resumeOptimization.ts`
- Delete: `backend/tests/resumeOptimizer.test.ts`
- Delete: `backend/tests/resumeOptimizeRoute.test.ts`
- Modify: `backend/src/index.ts:8,20`
- Modify: `backend/src/types/index.ts:195-209`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure removal). Confirms no other backend file imports `ResumeOptimizeRequestSchema`, `ResumeOptimizeRequest`, or `ResumeOptimizeResponse` before deleting them.

- [ ] **Step 1: Delete the resume-optimize route, service, prompt, and their tests**

```bash
rm backend/src/routes/resume.ts backend/src/services/resumeOptimizer.ts backend/src/prompts/resumeOptimization.ts backend/tests/resumeOptimizer.test.ts backend/tests/resumeOptimizeRoute.test.ts
```

- [ ] **Step 2: Remove the route registration from the Express app**

In `backend/src/index.ts`, remove line 8 (`import resumeRouter from "./routes/resume.js";`) and line 20 (`app.use("/api/resume", resumeRouter);`).

- [ ] **Step 3: Remove the now-unused Zod schema/types**

In `backend/src/types/index.ts`, delete the block at lines 195-209:

```ts
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

- [ ] **Step 4: Run the full backend test suite**

Run (from `backend/`): `npm test`
Expected: PASS — no test references the deleted files anymore (they were deleted in Step 1), and no other backend module imports the removed types (confirmed by the earlier grep — only `resume.ts`, `resumeOptimizer.ts`, `resumeOptimization.ts`, and `types/index.ts` itself referenced them).

- [ ] **Step 5: Commit**

```bash
git add -A backend/
git commit -m "chore: remove resume-optimize backend feature"
```

---

### Task 3: Frontend — shared API-profile helper and updated types

**Files:**
- Create: `frontend/src/lib/apiProfile.ts`
- Create: `frontend/src/lib/apiProfile.test.ts`
- Modify: `frontend/src/types/profile.ts:66-95` (`CoverLetterApiRequest`)
- Modify: `frontend/src/types/jobFit.ts`

**Interfaces:**
- Produces: `toApiCandidateProfile(profile: CandidateProfile): CoverLetterApiRequest["candidate_profile"]` — consumed by Task 8 (`Index.tsx`'s `handleAnalyzeMatch` and `handleGenerate`).
- Produces: `CoverLetterApiRequest.match_context?: { missing_requirements: string[]; critical_missing_skills: string[]; weaknesses: string[] }` — consumed by Task 8.
- Produces: trimmed `frontend/src/types/jobFit.ts` exporting only `RequirementCategory`, `CategoryScores`, `MatchAnalysisApiResponse` — consumed by Task 6 (`JobFitPanel`) and Task 8 (`Index.tsx`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/apiProfile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toApiCandidateProfile } from "./apiProfile";
import { DEFAULT_PROFILE } from "./profile";
import type { CandidateProfile } from "@/types/profile";

function makeProfile(overrides?: Partial<CandidateProfile>): CandidateProfile {
  return {
    ...DEFAULT_PROFILE,
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    location: "Toronto, ON",
    skills: ["React", "TypeScript"],
    experiences: [
      {
        id: "exp-1",
        title: "Engineer",
        company: "Acme",
        start_date: "2024",
        end_date: "2025",
        description: "Built things.",
        outcomes: ["Shipped a thing"],
      },
    ],
    projects: [
      { id: "proj-1", name: "Side Project", description: "A project", technologies: ["Vite"], outcomes: [] },
    ],
    education: [
      { id: "edu-1", programme: "BSc CS", university: "U of T", degree_year: "2026" },
    ],
    ...overrides,
  };
}

describe("toApiCandidateProfile", () => {
  it("strips client-only ids from experiences and projects", () => {
    const result = toApiCandidateProfile(makeProfile());

    expect(result.experiences[0]).not.toHaveProperty("id");
    expect(result.projects?.[0]).not.toHaveProperty("id");
    expect(result.experiences[0].title).toBe("Engineer");
  });

  it("flattens the primary education entry into top-level fields", () => {
    const result = toApiCandidateProfile(makeProfile());

    expect(result.programme).toBe("BSc CS");
    expect(result.university).toBe("U of T");
    expect(result.degree_year).toBe("2026");
  });

  it("omits education fields entirely when there is no education", () => {
    const result = toApiCandidateProfile(makeProfile({ education: [] }));

    expect(result.programme).toBeUndefined();
    expect(result.university).toBeUndefined();
    expect(result.degree_year).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- apiProfile.test.ts`
Expected: FAIL — `./apiProfile` module doesn't exist yet.

- [ ] **Step 3: Create `frontend/src/lib/apiProfile.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npm test -- apiProfile.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `match_context` to `CoverLetterApiRequest`**

In `frontend/src/types/profile.ts`, in the `CoverLetterApiRequest` interface (lines 66-95), add the field right before the closing brace (after `system_prompt?: string;` on line 94):

```ts
  system_prompt?: string;
  match_context?: {
    missing_requirements: string[];
    critical_missing_skills: string[];
    weaknesses: string[];
  };
}
```

- [ ] **Step 6: Trim `frontend/src/types/jobFit.ts` down to what's still needed**

Replace the full contents of `frontend/src/types/jobFit.ts` with:

```ts
export type RequirementCategory =
  | "skills"
  | "experience"
  | "keywords"
  | "education"
  | "technologies";

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
```

(This removes the `ResumeRecord` and `JobAnalysisRecord` interfaces and the now-unused `import type { CandidateProfile } from "./profile";`.)

- [ ] **Step 7: Run the full frontend test suite**

Run (from `frontend/`): `npm test`
Expected: PASS for `apiProfile.test.ts` and `example.test.ts`. `resumeStore.test.ts` and `jobAnalysisStore.test.ts` will now fail to type-check against the trimmed `jobFit.ts` — that's expected and fixed in Task 4 (next task deletes those files). If your test runner errors on this task in isolation, proceed to Task 4 before re-running the full suite.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/apiProfile.ts frontend/src/lib/apiProfile.test.ts frontend/src/types/profile.ts frontend/src/types/jobFit.ts
git commit -m "feat: add shared API-profile helper, trim jobFit types, add match_context"
```

---

### Task 4: Frontend — delete the old resume/job-analysis stores

**Files:**
- Delete: `frontend/src/lib/resumeStore.ts`
- Delete: `frontend/src/lib/resumeStore.test.ts`
- Delete: `frontend/src/lib/jobAnalysisStore.ts`
- Delete: `frontend/src/lib/jobAnalysisStore.test.ts`

**Interfaces:**
- Consumes: nothing (these are being removed; their only remaining consumers, `JobFit.tsx` and `OptimizeResumeDialog.tsx`, are deleted in Task 9 — deleting the stores first is safe because Task 3 already removed the types they depended on, and no other file references them per the earlier repo-wide grep).

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/lib/resumeStore.ts frontend/src/lib/resumeStore.test.ts frontend/src/lib/jobAnalysisStore.ts frontend/src/lib/jobAnalysisStore.test.ts
```

- [ ] **Step 2: Run the full frontend test suite**

Run (from `frontend/`): `npm test`
Expected: PASS — only `apiProfile.test.ts` and `example.test.ts` remain and both pass. (`JobFit.tsx` and `OptimizeResumeDialog.tsx` still import the deleted modules at this point in the plan; that's expected — they're deleted in Task 9. `npm test` only runs `*.test.ts` files, so this doesn't block on it, but `npm run build`/`tsc` will show errors until Task 9. Do not run a full typecheck/build until Task 9 is complete.)

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/lib/
git commit -m "chore: remove resume/job-analysis localStorage stores"
```

---

### Task 5: Frontend — `IconRail` component

**Files:**
- Create: `frontend/src/components/IconRail.tsx`

**Interfaces:**
- Produces: `IconRail` component with props `{ profileReady: boolean; onOpenProfile: () => void; onOpenInstructions: () => void; onToggleHistory: () => void; historyCount: number; historyActive: boolean; mounted: boolean; theme: string | undefined; onToggleTheme: () => void }` — consumed by Task 8 (`Index.tsx`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/IconRail.tsx`:

```tsx
import { User, Settings, History, Sun, Moon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconRailProps {
  profileReady: boolean;
  onOpenProfile: () => void;
  onOpenInstructions: () => void;
  onToggleHistory: () => void;
  historyCount: number;
  historyActive: boolean;
  mounted: boolean;
  theme: string | undefined;
  onToggleTheme: () => void;
}

export function IconRail({
  profileReady,
  onOpenProfile,
  onOpenInstructions,
  onToggleHistory,
  historyCount,
  historyActive,
  mounted,
  theme,
  onToggleTheme,
}: IconRailProps) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border/50 bg-card py-4">
      <img src="/logo.png" alt="CoverCraft" className="mb-2 h-8 w-8 rounded-md object-contain" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onOpenProfile}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            {!profileReady && (
              <AlertCircle className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background text-amber-500" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Profile{!profileReady ? " (incomplete)" : ""}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={historyActive ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleHistory}
            className="relative h-10 w-10"
          >
            <History className="h-4 w-4" />
            {historyCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                {historyCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Saved Letters</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onOpenInstructions} className="h-10 w-10">
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Instructions</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} className="h-10 w-10">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </TooltipContent>
        </Tooltip>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run (from `frontend/`): `npx tsc --noEmit -p . 2>&1 | grep IconRail || echo "no IconRail errors"`
Expected: `no IconRail errors` (pre-existing errors from other in-progress files are fine at this stage; the goal is confirming this new file itself is well-typed).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/IconRail.tsx
git commit -m "feat: add IconRail navigation component"
```

---

### Task 6: Frontend — `JobFitPanel` component

**Files:**
- Create: `frontend/src/components/JobFitPanel.tsx`

**Interfaces:**
- Consumes: `MatchResultsPanel` from `frontend/src/components/jobfit/MatchResultsPanel.tsx` (unchanged, `{ analysis: MatchAnalysisApiResponse; actions?: React.ReactNode }`), `MatchAnalysisApiResponse` from `@/types/jobFit` (Task 3), `CandidateProfile` from `@/types/profile`.
- Produces: `JobFitPanel` component and exported `ParsedJobInsights` interface — both consumed by Task 8 (`Index.tsx`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/JobFitPanel.tsx`:

```tsx
import { Loader2, Sparkles, Link2, Wand2, Undo2, Redo2, Eraser, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MatchResultsPanel } from "@/components/jobfit/MatchResultsPanel";
import type { CandidateProfile } from "@/types/profile";
import type { MatchAnalysisApiResponse } from "@/types/jobFit";

export interface ParsedJobInsights {
  company_name: string;
  role_title: string;
  location: string;
  requirements: string[];
  keywords: string[];
}

interface JobFitPanelProps {
  profile: CandidateProfile;
  profileReady: boolean;
  jobPosting: string;
  onJobPostingChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  jobUrl: string;
  onJobUrlChange: (value: string) => void;
  onImportFromLink: () => void;
  isImportingJob: boolean;
  jobInsights: ParsedJobInsights | null;
  onResearchCompany: () => void;
  isResearchingCompany: boolean;
  analysis: MatchAnalysisApiResponse | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

export function JobFitPanel({
  profile,
  profileReady,
  jobPosting,
  onJobPostingChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  jobUrl,
  onJobUrlChange,
  onImportFromLink,
  isImportingJob,
  jobInsights,
  onResearchCompany,
  isResearchingCompany,
  analysis,
  isAnalyzing,
  onAnalyze,
}: JobFitPanelProps) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto md:min-h-0">
      <div className="flex items-center justify-between">
        <label className="text-label text-foreground">Job Posting</label>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo} className="h-7 w-7 p-0" title="Undo">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo} className="h-7 w-7 p-0" title="Redo">
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={onClear} disabled={!jobPosting.trim()} className="h-7 w-7 p-0" title="Clear">
            <Eraser className="h-3.5 w-3.5" />
          </Button>
          {profileReady && profile.name && (
            <Badge variant="secondary" className="ml-1 gap-1">
              <User className="h-3 w-3" />
              {profile.name.split(" ")[0]}
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-3">
        <p className="mb-2 text-caption-medium text-muted-foreground">Import from Job Link</p>
        <div className="flex gap-2">
          <Input
            value={jobUrl}
            onChange={(e) => onJobUrlChange(e.target.value)}
            placeholder="https://jobs.company.com/role"
            className="h-9"
          />
          <Button variant="outline" onClick={onImportFromLink} disabled={isImportingJob} className="h-9 gap-1.5">
            {isImportingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Import
          </Button>
        </div>
      </div>

      <Textarea
        placeholder="Paste the full job posting here."
        className="min-h-[160px] resize-none border-border bg-card font-body text-body placeholder:text-muted-foreground/60 focus-visible:ring-accent"
        value={jobPosting}
        onChange={(e) => onJobPostingChange(e.target.value)}
      />

      {jobInsights && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-caption-medium text-muted-foreground">
              Auto-detected keywords and requirements
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onResearchCompany}
              disabled={isResearchingCompany}
              className="h-7 gap-1.5 text-caption"
            >
              {isResearchingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              Research Company
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobInsights.keywords.slice(0, 12).map((kw) => (
              <Badge key={kw} variant="secondary">
                {kw}
              </Badge>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">
            Company: <span className="font-medium text-foreground">{jobInsights.company_name}</span> • Role:{" "}
            <span className="font-medium text-foreground">{jobInsights.role_title}</span>
          </p>
        </div>
      )}

      <Button
        onClick={onAnalyze}
        disabled={isAnalyzing || !jobPosting.trim() || !profileReady}
        className="h-11 shrink-0 gap-2 font-semibold"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing match...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Analyze Match
          </>
        )}
      </Button>

      {analysis ? (
        <MatchResultsPanel analysis={analysis} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground/70">
          <Sparkles className="h-6 w-6" />
          <p>Your match results will appear here once you analyze a job posting.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run (from `frontend/`): `npx tsc --noEmit -p . 2>&1 | grep JobFitPanel || echo "no JobFitPanel errors"`
Expected: `no JobFitPanel errors`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/JobFitPanel.tsx
git commit -m "feat: add JobFitPanel (job posting + match analysis)"
```

---

### Task 7: Frontend — `CoverLetterPanel` component

**Files:**
- Create: `frontend/src/components/CoverLetterPanel.tsx`

**Interfaces:**
- Consumes: `QualityChecks` from `@/types/profile` (unchanged).
- Produces: `CoverLetterPanel` component — consumed by Task 8 (`Index.tsx`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/CoverLetterPanel.tsx`:

```tsx
import {
  Download, Sparkles, Loader2, AlertCircle, CheckCircle2, Pencil,
  Copy, FileDown, Edit3, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { QualityChecks } from "@/types/profile";

interface CoverLetterPanelProps {
  canGenerate: boolean;
  isGenerating: boolean;
  loadingMessage: string;
  onGenerate: () => void;
  coverLetter: string;
  onCoverLetterChange: (value: string) => void;
  letterTitle: string;
  onLetterTitleChange: (value: string) => void;
  isEditingTitle: boolean;
  onEditingTitleChange: (editing: boolean) => void;
  isEditingLetter: boolean;
  onEditingLetterChange: (editing: boolean) => void;
  onSaveEdit: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  qualityChecks: QualityChecks | null;
}

export function CoverLetterPanel({
  canGenerate,
  isGenerating,
  loadingMessage,
  onGenerate,
  coverLetter,
  onCoverLetterChange,
  letterTitle,
  onLetterTitleChange,
  isEditingTitle,
  onEditingTitleChange,
  isEditingLetter,
  onEditingLetterChange,
  onSaveEdit,
  onCopy,
  onDownloadTxt,
  onDownloadDocx,
  onDownloadPdf,
  qualityChecks,
}: CoverLetterPanelProps) {
  return (
    <div className="flex flex-col gap-3 md:min-h-0">
      <div className="flex items-center justify-between">
        <label className="text-label text-foreground">Your Cover Letter</label>
        {coverLetter && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={onCopy} className="h-7 gap-1.5 text-caption" title="Copy to clipboard">
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadTxt} className="h-7 gap-1.5 text-caption">
              <Download className="h-3 w-3" />
              .TXT
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadDocx} className="h-7 gap-1.5 text-caption">
              <FileDown className="h-3 w-3" />
              .DOCX
            </Button>
            <Button size="sm" onClick={onDownloadPdf} className="h-7 gap-1.5 bg-accent text-caption text-accent-foreground hover:bg-accent/90">
              <Download className="h-3 w-3" />
              .PDF
            </Button>
          </div>
        )}
      </div>

      {coverLetter && (
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <Input
              value={letterTitle}
              onChange={(e) => onLetterTitleChange(e.target.value)}
              onBlur={() => onEditingTitleChange(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditingTitleChange(false);
              }}
              autoFocus
              className="h-8 text-body-strong"
            />
          ) : (
            <button
              onClick={() => onEditingTitleChange(true)}
              className="flex items-center gap-1.5 text-left text-body-strong text-foreground transition-colors hover:text-accent"
            >
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{letterTitle || "Untitled Cover Letter"}</span>
            </button>
          )}
        </div>
      )}

      <div className="relative min-h-[260px] rounded-lg border border-border bg-card p-4 sm:p-6 md:flex-1 md:min-h-0">
        {coverLetter ? (
          <>
            <div className="absolute right-3 top-3 z-10">
              {isEditingLetter ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSaveEdit}
                  className="h-7 gap-1.5 border-green-200 bg-green-50 text-caption text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                >
                  <Check className="h-3 w-3" />
                  Done
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onEditingLetterChange(true)} className="h-7 gap-1.5 text-caption">
                  <Edit3 className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>

            {isEditingLetter ? (
              <Textarea
                value={coverLetter}
                onChange={(e) => onCoverLetterChange(e.target.value)}
                className="h-full min-h-0 resize-none overflow-y-auto border-0 p-0 font-body text-body shadow-none focus-visible:ring-0"
              />
            ) : (
              <div className="cover-letter-output h-full overflow-y-auto pr-16 text-sm text-foreground">
                {coverLetter}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-muted-foreground/50">
              Your AI-generated cover letter will appear here...
            </p>
          </div>
        )}
      </div>

      {qualityChecks && (
        <div className="flex flex-wrap gap-2">
          <QualityBadge label="No Dashes" pass={qualityChecks.no_dashes} description="Checks that the letter has no dash characters." />
          <QualityBadge label="No Bullets" pass={qualityChecks.no_bullets} description="Checks that the letter contains paragraphs only, with no bullets or numbered lists." />
          <QualityBadge label="Format OK" pass={qualityChecks.format_ok} description="Checks header, recipient block, salutation, paragraphs, and sign-off structure." />
          <QualityBadge label="Word Count" pass={qualityChecks.length_ok} description="Checks that letter length is between 280 and 380 words." />
          <QualityBadge label="Availability" pass={qualityChecks.availability_mentioned} description="Checks that your availability is explicitly mentioned in the opening paragraph." />
        </div>
      )}

      <Button
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        className="h-14 gap-3 rounded-xl bg-accent text-base font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 hover:shadow-xl hover:shadow-accent/30"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="animate-pulse">{loadingMessage}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Generate Cover Letter
          </>
        )}
      </Button>
    </div>
  );
}

function QualityBadge({
  label,
  pass,
  description,
}: {
  label: string;
  pass: boolean;
  description: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={pass ? "secondary" : "destructive"} className="cursor-help gap-1">
          {pass ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-caption">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run (from `frontend/`): `npx tsc --noEmit -p . 2>&1 | grep CoverLetterPanel || echo "no CoverLetterPanel errors"`
Expected: `no CoverLetterPanel errors`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CoverLetterPanel.tsx
git commit -m "feat: add CoverLetterPanel (generation, editing, downloads)"
```

---

### Task 8: Frontend — rewrite `Index.tsx` as the fused-workspace orchestrator

**Files:**
- Modify: `frontend/src/pages/Index.tsx` (full rewrite)

**Interfaces:**
- Consumes: `IconRail` (Task 5), `JobFitPanel` + `ParsedJobInsights` (Task 6), `CoverLetterPanel` (Task 7), `toApiCandidateProfile` (Task 3), `MatchAnalysisApiResponse` (Task 3), all existing `lib/history.ts`, `lib/profile.ts`, `lib/instructions.ts`, `lib/documents.ts`, `lib/pdf.ts`, `lib/docx.ts` exports (unchanged), `ProfileEditor` and `InstructionsEditor` components (unchanged).
- Produces: the single-page workspace rendered at route `/` — consumed by Task 9 (`App.tsx` still routes `/` to this same `Index` default export, no rename needed).

- [ ] **Step 1: Replace the full contents of `frontend/src/pages/Index.tsx`**

```tsx
import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ProfileEditor } from "@/components/ProfileEditor";
import { InstructionsEditor } from "@/components/InstructionsEditor";
import { IconRail } from "@/components/IconRail";
import { JobFitPanel, type ParsedJobInsights } from "@/components/JobFitPanel";
import { CoverLetterPanel } from "@/components/CoverLetterPanel";
import { loadHistory, saveToHistory, deleteFromHistory, updateHistoryItem, SavedCoverLetter } from "@/lib/history";
import { loadProfile, isProfileComplete } from "@/lib/profile";
import { loadInstructions } from "@/lib/instructions";
import { loadDocuments } from "@/lib/documents";
import { toApiCandidateProfile } from "@/lib/apiProfile";
import { downloadCoverLetterPDF } from "@/lib/pdf";
import { downloadCoverLetterDOCX } from "@/lib/docx";
import type { CandidateProfile, GenerationInstructions, CoverLetterApiRequest, CoverLetterApiResponse, QualityChecks } from "@/types/profile";
import type { MatchAnalysisApiResponse } from "@/types/jobFit";

const API_URL = import.meta.env.VITE_API_URL || "";

const LOADING_MESSAGES = [
  "Analyzing job requirements...",
  "Matching with your profile...",
  "Crafting your personalized cover letter...",
  "Polishing final details...",
];

function buildDefaultTitle(profileName: string, roleTitle?: string, company?: string): string {
  const firstName = profileName.split(" ")[0] || "My";
  if (roleTitle && company) {
    return `${firstName}'s Cover Letter for ${roleTitle} at ${company}`;
  }
  if (company) {
    return `${firstName}'s Cover Letter for ${company}`;
  }
  return `${firstName}'s Cover Letter`;
}

const Index = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [input, setInput] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [isResearchingCompany, setIsResearchingCompany] = useState(false);
  const [jobInsights, setJobInsights] = useState<ParsedJobInsights | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [matchAnalysis, setMatchAnalysis] = useState<MatchAnalysisApiResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [letterTitle, setLetterTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingLetter, setIsEditingLetter] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [history, setHistory] = useState<SavedCoverLetter[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [profile, setProfile] = useState<CandidateProfile>(loadProfile);
  const [instructions, setInstructions] = useState<GenerationInstructions>(loadInstructions);
  const [qualityChecks, setQualityChecks] = useState<QualityChecks | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setHistory(loadHistory());
    setInstructions(loadInstructions());
    setProfile(loadProfile());
  }, []);

  // Auto-parse job posting to highlight key requirements/keywords.
  useEffect(() => {
    if (input.trim().length < 120) {
      setJobInsights(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/job/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_posting: input }),
          signal: controller.signal,
        });
        if (!resp.ok) return;
        const parsed = await resp.json();
        setJobInsights(parsed);
      } catch {
        // silent on typing
      }
    }, 900);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [input]);

  // Cycle loading messages while generating
  useEffect(() => {
    if (!isGenerating) {
      setLoadingStep(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const profileReady = isProfileComplete(profile);

  const setJobPostingInput = (nextValue: string, recordHistory = true) => {
    setInput(nextValue);
    if (!recordHistory) return;
    setInputHistory((prev) => {
      const currentValue = prev[historyIndex];
      if (currentValue === nextValue) return prev;
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, nextValue];
    });
    setHistoryIndex((prev) => prev + 1);
  };

  const handleUndoInput = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setInput(inputHistory[nextIndex] || "");
  };

  const handleRedoInput = () => {
    if (historyIndex >= inputHistory.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setInput(inputHistory[nextIndex] || "");
  };

  const handleClearInput = () => {
    if (!input.trim()) return;
    setJobPostingInput("");
  };

  const handleImportFromJobLink = async () => {
    if (!jobUrl.trim()) {
      toast.error("Paste a job link first.");
      return;
    }
    setIsImportingJob(true);
    try {
      const resp = await fetch(`${API_URL}/api/job/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Failed to import job posting from URL");
      }
      setJobPostingInput(data.text || "");
      toast.success("Job posting imported from link.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to import job posting");
    } finally {
      setIsImportingJob(false);
    }
  };

  const handleResearchCompany = async () => {
    if (!input.trim()) {
      toast.error("Add a job posting first.");
      return;
    }
    setIsResearchingCompany(true);
    try {
      const resp = await fetch(`${API_URL}/api/job/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          company_name: jobInsights?.company_name || instructions.recipient_org || "",
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Failed to research company context");
      }

      const contextParts = [
        data.company_summary ? `Company summary: ${data.company_summary}` : "",
        data.mission ? `Mission: ${data.mission}` : "",
        Array.isArray(data.values) && data.values.length ? `Values: ${data.values.join(", ")}` : "",
        Array.isArray(data.recent_news) && data.recent_news.length
          ? `Recent news: ${data.recent_news.join("; ")}`
          : "",
      ].filter(Boolean);

      const mergedContext = contextParts.join("\n");
      const next = { ...instructions, company_context: mergedContext };
      setInstructions(next);
      toast.success("Company context added to instructions.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Company research failed");
    } finally {
      setIsResearchingCompany(false);
    }
  };

  const handleAnalyzeMatch = async () => {
    if (!profileReady) {
      toast.error("Please complete your profile first (name, email, location, phone).");
      setShowProfile(true);
      return;
    }
    if (!input.trim()) {
      toast.error("Paste a job posting first.");
      return;
    }

    setIsAnalyzing(true);
    setMatchAnalysis(null);
    try {
      const resp = await fetch(`${API_URL}/api/job/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_profile: toApiCandidateProfile(profile),
          job_posting: input,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Analysis failed, try again.");
      }

      setMatchAnalysis(data as MatchAnalysisApiResponse);
      toast.success("Match analysis complete.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast.error("Please paste a job posting first.");
      return;
    }
    if (!profileReady) {
      toast.error("Please complete your profile first (name, email, location, phone).");
      setShowProfile(true);
      return;
    }

    setIsGenerating(true);
    setCoverLetter("");
    setQualityChecks(null);
    setActiveId(undefined);
    setIsEditingLetter(false);

    try {
      const apiProfile = toApiCandidateProfile(profile);
      const cleanProfile = Object.fromEntries(
        Object.entries(apiProfile).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? undefined : v])
      );

      const docs = loadDocuments();
      const documentTexts = docs
        .filter((d) => d.extracted_text)
        .map((d) => ({ filename: d.filename, text: d.extracted_text }));

      const body: CoverLetterApiRequest = {
        candidate_profile: cleanProfile as CoverLetterApiRequest["candidate_profile"],
        job_posting: input,
        ...(instructions.company_context && { company_context: instructions.company_context }),
        ...(instructions.tone && { tone: instructions.tone }),
        ...(jobInsights?.keywords?.length && { priority_keywords: jobInsights.keywords.slice(0, 10) }),
        ...(instructions.availability && { availability: instructions.availability }),
        ...(instructions.recipient_name && { recipient_name: instructions.recipient_name }),
        ...(instructions.recipient_title && { recipient_title: instructions.recipient_title }),
        ...(instructions.recipient_org && { recipient_org: instructions.recipient_org }),
        ...(instructions.recipient_location && { recipient_location: instructions.recipient_location }),
        ...(instructions.date && { date: instructions.date }),
        ...(instructions.system_prompt && { system_prompt: instructions.system_prompt }),
        ...(documentTexts.length > 0 && { document_texts: documentTexts }),
        ...(matchAnalysis && {
          match_context: {
            missing_requirements: matchAnalysis.missing_requirements,
            critical_missing_skills: matchAnalysis.critical_missing_skills,
            weaknesses: matchAnalysis.weaknesses,
          },
        }),
      };

      const resp = await fetch(`${API_URL}/api/cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        let message = err.error || "Failed to generate cover letter";
        if (err.details) {
          const fields = Object.entries(err.details)
            .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
            .join("; ");
          message += ` (${fields})`;
        }
        throw new Error(message);
      }

      const data: CoverLetterApiResponse = await resp.json();
      setCoverLetter(data.cover_letter_text);
      setQualityChecks(data.quality_checks);

      const autoTitle = buildDefaultTitle(profile.name, data.extracted_fields.role_title, data.extracted_fields.company);
      setLetterTitle(autoTitle);

      if (data.cover_letter_text.trim()) {
        const saved = saveToHistory({ title: autoTitle, input, coverLetter: data.cover_letter_text });
        setHistory(loadHistory());
        setActiveId(saved.id);
        toast.success("Cover letter generated and saved!");
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectHistory = (item: SavedCoverLetter) => {
    setInput(item.input);
    setInputHistory([item.input]);
    setHistoryIndex(0);
    setCoverLetter(item.coverLetter);
    setLetterTitle(item.title);
    setActiveId(item.id);
    setQualityChecks(null);
    setIsEditingLetter(false);
  };

  const handleDeleteHistory = (id: string) => {
    deleteFromHistory(id);
    setHistory(loadHistory());
    if (activeId === id) setActiveId(undefined);
    toast.success("Removed from history");
  };

  const handleHistoryUpdated = () => {
    setHistory(loadHistory());
  };

  const sanitizeFilename = (name: string) =>
    name.replace(/[^a-zA-Z0-9\s']/g, "").replace(/\s+/g, " ").trim() || "cover-letter";

  const handleDownloadPDF = () => {
    if (!coverLetter) return;
    downloadCoverLetterPDF(coverLetter, `${sanitizeFilename(letterTitle)}.pdf`);
    toast.success("PDF downloaded!");
  };

  const handleDownloadTxt = () => {
    if (!coverLetter) return;
    const blob = new Blob([coverLetter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(letterTitle)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocx = async () => {
    if (!coverLetter) return;
    await downloadCoverLetterDOCX(coverLetter, `${sanitizeFilename(letterTitle)}.docx`);
    toast.success("DOCX downloaded!");
  };

  const handleCopyToClipboard = async () => {
    if (!coverLetter) return;
    try {
      await navigator.clipboard.writeText(coverLetter);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Try selecting the text manually.");
    }
  };

  const handleSaveEdit = () => {
    setIsEditingLetter(false);
    if (activeId) {
      updateHistoryItem(activeId, { coverLetter });
      setHistory(loadHistory());
      toast.success("Changes saved");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background transition-colors">
      <IconRail
        profileReady={profileReady}
        onOpenProfile={() => setShowProfile(true)}
        onOpenInstructions={() => setShowInstructions(true)}
        onToggleHistory={() => setShowHistory((v) => !v)}
        historyCount={history.length}
        historyActive={showHistory}
        mounted={mounted}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border/50 px-6 py-5">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <img src="/logo.png" alt="CoverCraft" className="h-10 w-10 rounded-lg object-contain" />
            <div>
              <h1 className="font-display text-title text-foreground">CoverCraft</h1>
              <p className="text-caption text-muted-foreground">AI-powered cover letters</p>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 md:overflow-hidden">
          <div className="mb-4 text-center">
            <h2 className="font-display text-display text-foreground">
              Analyze the job, then craft the perfect <span className="text-accent">cover letter</span>
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Set up your profile once, paste a job posting, see how you match, and let AI write a
              compelling, personalized cover letter tailored to you.
            </p>

            {!profileReady && (
              <button
                onClick={() => setShowProfile(true)}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-caption text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/50"
              >
                <AlertCircle className="h-4 w-4" />
                Complete your profile to get started
              </button>
            )}
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <StepCard title="Step 1" subtitle="Set Up Profile" done={profile.skills.length > 0 || profile.experiences.length > 0} />
            <StepCard title="Step 2" subtitle="Paste or Import Job" done={input.trim().length > 0} />
            <StepCard title="Step 3" subtitle="Analyze Match" done={Boolean(matchAnalysis)} />
            <StepCard title="Step 4" subtitle="Generate Letter" done={Boolean(coverLetter)} />
          </div>

          <div className={`grid gap-5 md:flex-1 md:min-h-0 ${showHistory ? "lg:grid-cols-[280px_1fr_1fr]" : "lg:grid-cols-2"}`}>
            {showHistory && (
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <h3 className="mb-3 flex items-center gap-2 text-heading text-foreground">Saved Letters</h3>
                <HistoryPanel
                  history={history}
                  onSelect={handleSelectHistory}
                  onDelete={handleDeleteHistory}
                  activeId={activeId}
                  onHistoryUpdated={handleHistoryUpdated}
                />
              </div>
            )}

            <JobFitPanel
              profile={profile}
              profileReady={profileReady}
              jobPosting={input}
              onJobPostingChange={setJobPostingInput}
              onUndo={handleUndoInput}
              onRedo={handleRedoInput}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < inputHistory.length - 1}
              onClear={handleClearInput}
              jobUrl={jobUrl}
              onJobUrlChange={setJobUrl}
              onImportFromLink={handleImportFromJobLink}
              isImportingJob={isImportingJob}
              jobInsights={jobInsights}
              onResearchCompany={handleResearchCompany}
              isResearchingCompany={isResearchingCompany}
              analysis={matchAnalysis}
              isAnalyzing={isAnalyzing}
              onAnalyze={handleAnalyzeMatch}
            />

            <CoverLetterPanel
              canGenerate={Boolean(input.trim()) && profileReady}
              isGenerating={isGenerating}
              loadingMessage={LOADING_MESSAGES[loadingStep]}
              onGenerate={handleGenerate}
              coverLetter={coverLetter}
              onCoverLetterChange={setCoverLetter}
              letterTitle={letterTitle}
              onLetterTitleChange={setLetterTitle}
              isEditingTitle={isEditingTitle}
              onEditingTitleChange={setIsEditingTitle}
              isEditingLetter={isEditingLetter}
              onEditingLetterChange={setIsEditingLetter}
              onSaveEdit={handleSaveEdit}
              onCopy={handleCopyToClipboard}
              onDownloadTxt={handleDownloadTxt}
              onDownloadDocx={handleDownloadDocx}
              onDownloadPdf={handleDownloadPDF}
              qualityChecks={qualityChecks}
            />
          </div>

          <div className="pt-3 text-center text-[13px] text-muted-foreground/70">
            © 2026 Bernardino Lintang, Joel Surya. All rights reserved.
          </div>
        </main>
      </div>

      <ProfileEditor open={showProfile} onOpenChange={setShowProfile} onProfileSaved={setProfile} />
      <InstructionsEditor open={showInstructions} onOpenChange={setShowInstructions} onInstructionsSaved={setInstructions} />
    </div>
  );
};

function StepCard({ title, subtitle, done }: { title: string; subtitle: string; done: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-caption text-muted-foreground">{title}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-body-strong text-foreground">{subtitle}</p>
        {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />}
      </div>
    </div>
  );
}

export default Index;
```

- [ ] **Step 2: Verify it compiles**

Run (from `frontend/`): `npx tsc --noEmit -p . 2>&1 | grep "pages/Index" || echo "no Index.tsx errors"`
Expected: `no Index.tsx errors`. (Errors from `JobFit.tsx` / `OptimizeResumeDialog.tsx` importing the deleted stores are still expected until Task 9 — ignore those for this check.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Index.tsx
git commit -m "feat: fuse Job Fit and Cover Letter into one workspace page"
```

---

### Task 9: Frontend — remove the old Job Fit page and route

**Files:**
- Delete: `frontend/src/pages/JobFit.tsx`
- Delete: `frontend/src/components/jobfit/OptimizeResumeDialog.tsx`
- Modify: `frontend/src/App.tsx:9,23`

**Interfaces:**
- Consumes: nothing new. This is the task where the whole app becomes typecheck-clean again, since it removes the last files importing the deleted `resumeStore`/`jobAnalysisStore` modules and the `/job-fit` route.

- [ ] **Step 1: Delete the old Job Fit page and optimize dialog**

```bash
rm frontend/src/pages/JobFit.tsx frontend/src/components/jobfit/OptimizeResumeDialog.tsx
```

- [ ] **Step 2: Update the router**

In `frontend/src/App.tsx`, remove line 9 (`import JobFit from "./pages/JobFit";`) and remove line 23 (`<Route path="/job-fit" element={<JobFit />} />`), leaving:

```tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
```

- [ ] **Step 3: Run full typecheck, lint, and test suite for the whole repo**

Run (from `frontend/`): `npx tsc --noEmit -p .`
Expected: no errors.

Run (from `frontend/`): `npm test`
Expected: PASS.

Run (from `backend/`): `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/pages/JobFit.tsx frontend/src/components/jobfit/OptimizeResumeDialog.tsx frontend/src/App.tsx
git commit -m "chore: remove old Job Fit page and route, now fused into the main workspace"
```

---

### Task 10: Manual verification in-browser

**Files:** none (verification only).

- [ ] **Step 1: Start both dev servers**

Run (from `backend/`): `npm run dev`
Run (from `frontend/`): `npm run dev`

- [ ] **Step 2: Verify the centralized-profile flow**

In the browser: open the app, confirm the profile avatar in the icon rail shows an "incomplete" indicator if no profile exists. Click it, upload a resume via "Upload Resume / CV to auto-fill" in the profile sheet, save. Confirm the profile is now marked complete in the rail.

- [ ] **Step 3: Verify one profile powers both match analysis and cover letter generation**

Paste a job posting into the left panel, click "Analyze Match", confirm match results render (score, category breakdowns, matched/missing requirements) using the same profile just uploaded — no second upload prompt anywhere. Then click "Generate Cover Letter" in the right panel and confirm a letter is produced referencing the same profile, without needing to re-enter or re-upload anything.

- [ ] **Step 4: Verify history, instructions, and theme still work from the rail**

Click the History icon, confirm the saved-letters panel opens/closes and the generated letter appears in it. Click Instructions, confirm the sheet still opens and saves. Toggle the theme icon, confirm dark/light mode switches.

- [ ] **Step 5: Confirm no dead references remain**

Run (from repo root): `grep -rn "job-fit\|JobFit\|resumeStore\|jobAnalysisStore\|OptimizeResumeDialog\|resume/optimize\|ResumeOptimize" frontend/src backend/src backend/tests --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: no output (aside from anything intentionally unrelated, which none should be at this point).

- [ ] **Step 6: Final report**

No commit needed for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and commit a follow-up fix with a clear message (e.g. `fix: <description>`).
