# Profile Column Collapse — Design Spec

## Problem

The Profile column is visibly taller and busier than the Job & Match and Cover Letter columns next to it: an upload button, a four-field contact form, and four summary sections (Skills, Experience, Education, Projects) are all rendered at once, every time. Since most users fill in their profile once and rarely touch it again while working through job postings, that full detail is usually not what they need to see — it's just there, taking up space and making the dashboard feel lopsided.

## Goals

1. Make the Profile column feel lighter by default — both shorter and visually calmer — for the common case (profile already complete, user is here for the job posting and cover letter).
2. Keep editing one click away and fully inline — no modal/popup, consistent with this app's existing "always inline, no sheet" direction.
3. Reuse the app's existing expand/collapse state and default-expand logic rather than introducing a second, parallel mechanism.
4. Make it clearer that the Skills section specifically affects job-match scoring.

## Non-Goals

- Any change to `JobFitPanel` or `CoverLetterPanel`.
- Any change to the individual section components' (`SkillsSection`, `EducationSection`, `ExperienceSection`, `ProjectsSection`) internal edit/summary toggle behavior — they keep working exactly as they do today once the Profile column itself is expanded.
- Persisting the user's manual expand/collapse choice across page reloads — this spec deliberately keeps the existing reset-on-reload behavior.
- Changing the completeness-gating logic (`isProfileComplete()`) itself.

## Architecture

The app already tracks an `expandedSections: string[]` state in `Index.tsx` (values `"profile" | "jobMatch" | "coverLetter"`), seeded once via the existing pure function `getDefaultExpandedSections({ profileComplete, hasCoverLetter })` from `frontend/src/lib/dashboardLayout.ts`. Today this only drives the mobile accordion (`Accordion type="multiple"`); the desktop grid renders `ProfileColumn` unconditionally, always fully expanded.

This spec extends that same state to the desktop layout instead of introducing a second mechanism:

- **New component `ProfileSummaryCard`** (`frontend/src/components/profile/ProfileSummaryCard.tsx`): a small, stateless, presentational component that renders the "collapsed" view — name, completeness indicator, and quick counts. Takes `profile: CandidateProfile` as its only prop; renders no interactivity of its own (the click handling and chevron live in whichever wrapper renders it).
- **Desktop**: the `hidden lg:block` wrapper around `ProfileColumn` becomes a `Collapsible` (`frontend/src/components/ui/collapsible.tsx`, already used elsewhere via the shadcn/ui primitive set). `CollapsibleTrigger` renders `ProfileSummaryCard` plus a chevron; `CollapsibleContent` renders the full `ProfileColumn`. `open` is `expandedSections.includes("profile")`; `onOpenChange` toggles `"profile"` in/out of the `expandedSections` array — the same array the mobile accordion already reads and writes.
- **Mobile**: the existing `AccordionItem value="profile"` keeps its structure, but its `AccordionTrigger` renders `ProfileSummaryCard` instead of the current plain "Profile" text label, so the compact preview is consistent across both breakpoints.
- Default expand/collapse on load is unchanged: `getDefaultExpandedSections` already returns `"profile"` in the array only when the profile is incomplete — this now governs the desktop card's initial state exactly as it already governs the mobile accordion's.

## ProfileSummaryCard — Content

- **Left**: a `User` icon, then the profile's name — or `"Your Profile"` as a fallback while `profile.name` is still empty — followed by the same completeness indicator already used inside `ProfileColumn` (`CheckCircle2` when complete, a muted dot otherwise).
- **Right**: a muted counts line built from `profile.skills.length`, `profile.experiences.length`, `profile.education.length` — e.g. `"12 skills · 2 roles · 1 degree"`. Each segment is included only if its count is greater than 0 (a brand-new, empty profile shows no counts at all — the completeness dot alone communicates "not ready yet"). Segment labels pluralize based on count (`"1 role"` vs `"2 roles"`, `"1 degree"` vs `"2 degrees"`).
- **Far right**: a chevron icon that rotates 180° based on expanded state, matching the existing `AccordionTrigger` chevron treatment used elsewhere in this app, so the affordance reads as "expandable" without new copy.
- The entire row is the click target (desktop `CollapsibleTrigger` / mobile `AccordionTrigger` already provide this for free — `ProfileSummaryCard` itself contains no click handling, keeping it purely presentational and easy to test in isolation).

## Skills Subtext

A single small caption line is added directly under the "Skills" section header inside `SkillsSection` (visible in both its summary and edit views, since match-relevance is worth surfacing either way): *"Skills you add here affect how closely you match a job posting."* Styled with the same `text-caption text-muted-foreground` classes already used for hint text elsewhere in this component family (e.g. the upload area's helper text in `ProfileColumn`).

## Data Flow

- No new persisted state. `expandedSections` remains local React state in `Index.tsx`, seeded once via `getDefaultExpandedSections` and never written to localStorage — consistent with the existing mobile-only behavior, now shared by desktop.
- No changes to `CandidateProfile`, `isProfileComplete()`, or any API contract.

## Error Handling & Edge Cases

- A profile with zero skills/experiences/education (a brand-new user) never reaches the collapsed state on initial load, since `getDefaultExpandedSections` returns `"profile"` as expanded whenever `isProfileComplete()` is false, and an empty profile is never complete (`isProfileComplete` requires name/email/location/phone). A user could still manually collapse an incomplete profile — in that case `ProfileSummaryCard` shows the muted dot and whatever counts happen to be non-zero, same as any other state.
- Editing a section while the Profile column is expanded, then manually collapsing it, does not lose data — nothing here changes how individual sections commit their edits (unchanged behavior from the existing per-section summary/edit toggle).

## Testing

- `ProfileSummaryCard`: unit tests for the counts line — zero counts omitted, singular/plural label forms, name fallback to "Your Profile", completeness indicator reflecting `isProfileComplete()`.
- Manual in-browser verification: confirm desktop collapse/expand toggles independently of the mobile accordion's own item state is preserved correctly (both read the same `expandedSections` array, so this should be automatic — verify no double-toggle or stale-state issue when resizing across the `lg` breakpoint mid-session); confirm a newly-loaded incomplete profile starts expanded on both breakpoints; confirm a complete profile starts collapsed on both breakpoints; confirm the Skills subtext renders in both summary and edit views.
