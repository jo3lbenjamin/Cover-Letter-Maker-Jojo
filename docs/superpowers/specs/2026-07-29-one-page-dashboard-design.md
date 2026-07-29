# One-Page Dashboard Layout — Design Spec

## Problem

The fused workspace (`Index.tsx`) already puts Job Fit and Cover Letter Maker on one page, but the candidate profile (resume upload, skills, education, experience) still lives behind a slide-out `Sheet` opened from the icon rail, and a linear "Step 1–4" progress strip sits above a 2-column grid. This means the profile is hidden by default, requires an extra click to reach, and the page still communicates a step-by-step flow rather than an always-visible dashboard. The goal is a true single-screen dashboard: upload once, see your skills/education, see how you match a job, and write the letter — all visible together, with the fewest clicks possible.

This spec covers the layout restructure only. Two related but independent efforts are deliberately out of scope here and will get their own specs later: an in-line resume editor that highlights what to improve, and a visual rebrand (name, colors, logo).

## Goals

1. The candidate profile (upload, skills, education, experience) is permanently visible on the main page — no slide-out sheet required to see or start editing it.
2. Job posting + match analysis, and cover letter generation, remain one click away from each other and from the profile, on the same screen.
3. Fewer clicks end-to-end: upload → see extracted profile → paste job → see match → generate letter, without navigating away from the page at any point.
4. The page reads as a dashboard (everything visible, always) rather than a wizard (step 1, then step 2, ...).

## Non-Goals

- The in-line resume editor with gap-highlighting (Overleaf-style) — separate future spec.
- The rebrand (name, visual identity, logo) — separate future spec.
- Any change to the Job Fit matching logic, cover letter generation logic, or backend APIs — this is a layout/presentation change only.
- Any change to "My Documents" or "Instructions" functionality — they keep their current sheet-based UI and content, just remain reachable from the icon rail as they are today.

## Architecture

The page becomes a permanent **3-column dashboard**:

| Left | Middle | Right |
|---|---|---|
| Profile | Job & Match | Cover Letter |

- **Profile column** is new: today's `ProfileEditor` sheet content is adapted into an always-visible column component (`ProfileColumn`), replacing the icon-rail profile sheet entirely.
- **Job & Match column** is today's `JobFitPanel`, repositioned but functionally unchanged.
- **Cover Letter column** is today's `CoverLetterPanel`, repositioned but functionally unchanged.
- **Icon rail** keeps its existing slide-outs for **Documents** ("My Documents"), **Instructions** (recipient/tone/generation settings), and **History** (saved cover letters) — all three remain occasional-use secondary panels, not part of the permanent dashboard. History moves from its current "toggle in as an extra grid column" behavior into an icon-rail sheet, consistent with Documents and Instructions.
- The **Step 1–4 progress strip** is removed. Readiness is communicated via small inline status indicators inside each column instead (e.g., a checkmark/dot near the profile's contact fields once complete), rather than a separate tracker above the grid.

## Profile Column

New `ProfileColumn` component (replacing `ProfileEditor`'s sheet-only usage; the underlying form logic is reused, not rewritten):

- **Upload area** at the top — drag/drop or click-to-browse. Same extraction pipeline as today (`POST /api/profile/extract`), just rendered inline in the column instead of inside a `Sheet`.
- **Contact mini-form** directly below upload: name, email, phone, location — the fields that gate `isProfileComplete()`. Always visible and directly editable (small enough that an edit-toggle would add friction, not remove it).
- **Skills / Experience / Education summary cards** below that: each renders as a compact read-only summary (chips for skills, condensed list items for experience/education) by default.
- Each summary card has a small **"Edit" toggle** that swaps just that card into its existing form-editing UI in place (add/remove/reorder entries), then swaps back to the summary view on save. Only one card is in edit mode at a time.
- A small completeness indicator sits near the contact mini-form (checkmark when `isProfileComplete()` is true, muted dot otherwise) — replaces both the old amber "complete your profile" banner and the step-strip's "Step 1" card.

## Job & Match Column

Unchanged behavior from today's `JobFitPanel`, repositioned as the permanent middle column:

- Job posting input (paste or import via URL), undo/redo/clear.
- Company research affordance.
- "Analyze" → `POST /api/job/match` → match score + Requirements Coverage (matched/missing requirements, critical missing skills, weaknesses) via the existing `MatchResultsPanel`.
- Disabled with an inline prompt pointing at the Profile column when the profile is incomplete — same gating logic as today (`isProfileComplete()`), just the prompt now points at an always-visible column instead of opening a sheet.

## Cover Letter Column

Unchanged behavior from today's `CoverLetterPanel`, repositioned as the permanent right column: generate, edit, copy, download (PDF/DOCX/TXT). No functional changes.

## Responsive Behavior

- **Wide screens** (≥ `lg` breakpoint): all three columns render side-by-side, permanently expanded, no collapse affordance.
- **Narrow screens** (< `lg`): columns stack vertically in order (Profile, then Job & Match, then Cover Letter). Each becomes a **collapsible accordion section** with an expand/collapse chevron in its header, so a user can close sections they aren't actively using instead of scrolling past them. Default expand/collapse state on first load: Profile expanded if incomplete (needs attention), collapsed if complete; Job & Match expanded; Cover Letter collapsed until a letter exists or is being generated. Collapsing a section is purely a UI state (not persisted) — it resets to the default on reload.

## Data Flow / State Changes

- No new data model changes. `CandidateProfile`, `MatchAnalysisApiResponse`, and the active-job in-memory state all remain exactly as defined in the existing fused-workspace design (`2026-07-28-centralized-profile-fused-workspace-design.md`).
- `Index.tsx` no longer holds `showProfile` sheet-open state for the purpose of gating profile visibility (profile is always visible); it may still track per-card edit-mode state (`editingSkills`, `editingEducation`, `editingExperience` or similar) local to `ProfileColumn`.
- `showHistory` boolean toggle is replaced by the same sheet-open pattern already used for `showInstructions` (a `Sheet`/drawer opened from the icon rail), rather than a grid-column toggle.

## Error Handling & Edge Cases

- Same completeness gating as today: Job & Match and Cover Letter columns show an inline disabled state with a prompt when the profile is incomplete, instead of allowing API calls to fail.
- Extraction failures (unparseable file, empty/too-short text) keep existing toast-based error handling.
- Editing a summary card and navigating away without saving: changes are held in local component state and discarded if the user collapses/toggles away without an explicit save, consistent with the current `ProfileEditor` form behavior (no autosave-on-blur).
- If a screen is resized across the responsive breakpoint while a card is mid-edit, the edit state is preserved (it's just presentation/layout that changes, not component unmount).

## Removed / Changed Components

- `frontend/src/components/ProfileEditor.tsx` — logic retained, but no longer rendered as a `Sheet`; its form pieces are extracted into `ProfileColumn.tsx` (new) with per-section summary/edit-toggle wrapping.
- `Index.tsx` — layout markup changes from 2-column-with-optional-history-column to permanent 3-column grid with responsive accordion stacking; step-progress-strip (`StepCard` and the grid above the main columns) removed.
- `IconRail.tsx` — profile icon/button removed (or repurposed, e.g. as a "scroll to profile column" shortcut on narrow screens where it's collapsed); History gains a sheet-open affordance matching Documents/Instructions.
- No changes to `JobFitPanel.tsx`, `CoverLetterPanel.tsx`, `HistoryPanel.tsx`, `InstructionsEditor.tsx`, or any backend route.

## Testing

- Manual in-browser verification: confirm profile is visible without opening any sheet; confirm upload → extraction → skills/education appear inline; confirm per-card edit toggle works independently per section; confirm Job & Match and Cover Letter columns behave identically to today; confirm History/Documents/Instructions still reachable from the icon rail; confirm narrow-viewport accordion collapse/expand behavior and default expand states.
- No backend changes, so no backend test changes expected.
- Existing frontend tests referencing `ProfileEditor` as a sheet-rendered component will need updating to reflect its new column-based rendering context (import path may change if the component is renamed/split into `ProfileColumn`).
