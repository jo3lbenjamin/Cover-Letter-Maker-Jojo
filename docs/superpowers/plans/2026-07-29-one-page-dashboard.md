# One-Page Dashboard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fused workspace page into a permanent 3-column dashboard (Profile | Job & Match | Cover Letter) where the candidate profile is always visible inline instead of hidden behind a slide-out sheet, with collapsible accordion sections on narrow screens.

**Architecture:** Split the monolithic `ProfileEditor` sheet into small per-field-group components (`SkillsSection`, `EducationSection`, `ExperienceSection`, `ProjectsSection`) built on a shared `ProfileSummarySection` wrapper that toggles between a read-only summary and an in-place edit form. These compose into a new `ProfileColumn` that renders permanently in `Index.tsx`. "My Documents" (currently nested inside `ProfileEditor`) is extracted into its own `DocumentsEditor` sheet reachable from the icon rail, since it must keep its existing sheet-based UI per the design spec, but the design spec assumed it already had a dedicated rail icon — it doesn't yet, so this plan adds one. History moves from a toggleable grid column into a sheet (`HistorySheet`), matching Documents/Instructions. `Index.tsx` is restructured into a 3-column grid that collapses to stacked, independently-collapsible accordion sections below the `lg` breakpoint.

**Tech Stack:** React + TypeScript, Tailwind CSS, shadcn/ui (`Sheet`, `Collapsible`, `Badge`, `Button`, `Input`, `Textarea`), Vitest + @testing-library/react for tests, `sonner` for toasts.

## Global Constraints

- No backend changes — this is frontend-only (per spec Non-Goals).
- No changes to `JobFitPanel.tsx`, `CoverLetterPanel.tsx`, or any backend route (per spec).
- The completeness gate stays `isProfileComplete()` from `frontend/src/lib/profile.ts` (name, email, location, phone) — unchanged logic, only its UI presentation changes.
- Resume upload and extraction still calls `POST /api/profile/extract` with `{ text: text.slice(0, 15000) }` and merges into `CandidateProfile` exactly as `ProfileEditor.handleFileUpload` does today — do not change the merge behavior.
- Existing localStorage keys (`covercraft-profile`, `covercraft-documents`) are unchanged.
- Keep all copy/tone consistent with existing toasts (e.g. "Profile saved!", "Education entry removed.").

---

### Task 1: Extract "My Documents" into its own `DocumentsEditor` sheet

**Files:**
- Create: `frontend/src/components/DocumentsEditor.tsx`
- Create: `frontend/src/components/DocumentsEditor.test.tsx`
- Modify: `frontend/src/components/IconRail.tsx`
- Modify: `frontend/src/pages/Index.tsx`

**Interfaces:**
- Consumes: `loadDocuments`, `addDocument`, `removeDocument` from `@/lib/documents`; `extractTextFromFile` from `@/lib/fileTextExtractor`; `UploadedDocument` from `@/types/profile`.
- Produces: `DocumentsEditor({ open: boolean; onOpenChange: (open: boolean) => void })` — a `Sheet`-based component with no other props (documents are read/written directly via the `documents` lib, same as `HistoryPanel`'s self-contained collections lib usage).

This task doesn't touch `ProfileEditor.tsx` yet (that happens in Task 8) — it only builds the new, independent `DocumentsEditor` and wires it in alongside the old profile sheet, so both can coexist until the old sheet is removed later.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/DocumentsEditor.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DocumentsEditor } from "./DocumentsEditor";
import { addDocument } from "@/lib/documents";

describe("DocumentsEditor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists existing documents and removes one on confirm", async () => {
    addDocument({
      id: "doc-1",
      filename: "portfolio.pdf",
      document_type: "portfolio",
      uploadedAt: new Date().toISOString(),
      extracted_text: "some text",
    });

    render(<DocumentsEditor open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("portfolio.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove document/i }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, delete/i }));

    await waitFor(() => {
      expect(screen.queryByText("portfolio.pdf")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when there are no documents", () => {
    render(<DocumentsEditor open={true} onOpenChange={() => {}} />);
    expect(screen.getByText(/no documents uploaded yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/DocumentsEditor.test.tsx`
Expected: FAIL with "Cannot find module './DocumentsEditor'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/DocumentsEditor.tsx
import { useState, useEffect, useRef } from "react";
import { FileUp, Plus, Loader2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { UploadedDocument } from "@/types/profile";
import { loadDocuments, addDocument, removeDocument } from "@/lib/documents";
import { extractTextFromFile } from "@/lib/fileTextExtractor";

interface DocumentsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentsEditor({ open, onOpenChange }: DocumentsEditorProps) {
  const [documents, setDocuments] = useState<UploadedDocument[]>(loadDocuments);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDocuments(loadDocuments());
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      toast.info("Extracting text from document...");
      const text = await extractTextFromFile(file);

      addDocument({
        id: crypto.randomUUID(),
        filename: file.name,
        document_type: "portfolio",
        uploadedAt: new Date().toISOString(),
        extracted_text: text || "",
      });
      setDocuments(loadDocuments());
      toast.success(`Document "${file.name}" added to your library`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to process document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    removeDocument(pendingDeleteId);
    setDocuments(loadDocuments());
    toast.success("Document removed from library.");
    setPendingDeleteId(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            My Documents
          </SheetTitle>
          <SheetDescription>
            Upload portfolios, website PDFs, transcripts, or any supporting documents. The AI will use these as reference when writing your cover letters.
          </SheetDescription>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full gap-2 border-dashed"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Upload Document
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{doc.filename}</p>
                  <p className="text-caption text-muted-foreground">
                    {doc.document_type} &middot; {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove document"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setPendingDeleteId(doc.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {documents.length === 0 && (
            <p className="text-caption text-muted-foreground text-center py-4">
              No documents uploaded yet. Add resumes, portfolios, or other references.
            </p>
          )}
        </div>

        <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this entry. Once deleted, it cannot be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/DocumentsEditor.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into IconRail and Index (additive, old Profile/Documents-in-sheet still present)**

In `frontend/src/components/IconRail.tsx`, add a new prop and button between the existing Profile and History buttons:

```tsx
interface IconRailProps {
  profileReady: boolean;
  onOpenProfile: () => void;
  onOpenDocuments: () => void;
  onOpenInstructions: () => void;
  onToggleHistory: () => void;
  historyCount: number;
  historyActive: boolean;
  mounted: boolean;
  theme: string | undefined;
  onToggleTheme: () => void;
}
```

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" onClick={onOpenDocuments} className="h-10 w-10">
      <FileUp className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent side="right">My Documents</TooltipContent>
</Tooltip>
```

Add `FileUp` to the `lucide-react` import list in `IconRail.tsx`.

In `frontend/src/pages/Index.tsx`, add `const [showDocuments, setShowDocuments] = useState(false);`, pass `onOpenDocuments={() => setShowDocuments(true)}` to `<IconRail />`, and render `<DocumentsEditor open={showDocuments} onOpenChange={setShowDocuments} />` next to the existing `<ProfileEditor ... />` / `<InstructionsEditor ... />` at the bottom of the component. Import `DocumentsEditor` from `@/components/DocumentsEditor`.

- [ ] **Step 6: Manually verify no regressions**

Run: `cd frontend && npm run dev` (or use the `run` skill), open the app, click the new document icon in the rail, upload a file, confirm it appears in the list and in the still-present old Profile sheet's "My Documents" section (both read the same `covercraft-documents` key, so this is expected and temporary — the duplication is removed in Task 8).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DocumentsEditor.tsx frontend/src/components/DocumentsEditor.test.tsx frontend/src/components/IconRail.tsx frontend/src/pages/Index.tsx
git commit -m "feat: extract My Documents into its own icon-rail sheet"
```

---

### Task 2: Build the `ProfileSummarySection` wrapper component

**Files:**
- Create: `frontend/src/components/profile/ProfileSummarySection.tsx`
- Create: `frontend/src/components/profile/ProfileSummarySection.test.tsx`

**Interfaces:**
- Produces:
```ts
interface ProfileSummarySectionProps {
  title: string;
  icon: React.ReactNode;
  isEmpty: boolean;
  emptyLabel: string;
  renderSummary: () => React.ReactNode;
  renderEdit: (close: () => void) => React.ReactNode;
  onEditOpenChange?: (isEditing: boolean) => void;
}
```
This is a plain local-state wrapper: `isEditing` boolean, toggled by an "Edit"/"Done" button in the section header. When `isEmpty` is true and not editing, renders `emptyLabel` instead of `renderSummary()`. Later tasks (`SkillsSection`, `EducationSection`, `ExperienceSection`, `ProjectsSection`) all render `<ProfileSummarySection>` with their own summary/edit content.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/ProfileSummarySection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileSummarySection } from "./ProfileSummarySection";

describe("ProfileSummarySection", () => {
  it("shows the summary view by default and toggles to edit view on click", () => {
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={false}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>React, TypeScript</p>}
        renderEdit={(close) => <button onClick={close}>Done editing</button>}
      />
    );

    expect(screen.getByText("React, TypeScript")).toBeInTheDocument();
    expect(screen.queryByText("Done editing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByText("Done editing")).toBeInTheDocument();
    expect(screen.queryByText("React, TypeScript")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Done editing"));

    expect(screen.getByText("React, TypeScript")).toBeInTheDocument();
  });

  it("shows the empty label instead of the summary when isEmpty is true", () => {
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={true}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>React, TypeScript</p>}
        renderEdit={() => <div />}
      />
    );

    expect(screen.getByText("No skills added yet.")).toBeInTheDocument();
    expect(screen.queryByText("React, TypeScript")).not.toBeInTheDocument();
  });

  it("calls onEditOpenChange when toggled", () => {
    const onEditOpenChange = vi.fn();
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={false}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>Summary</p>}
        renderEdit={() => <div>Edit</div>}
        onEditOpenChange={onEditOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEditOpenChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/ProfileSummarySection.test.tsx`
Expected: FAIL with "Cannot find module './ProfileSummarySection'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/ProfileSummarySection.tsx
import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileSummarySectionProps {
  title: string;
  icon: React.ReactNode;
  isEmpty: boolean;
  emptyLabel: string;
  renderSummary: () => React.ReactNode;
  renderEdit: (close: () => void) => React.ReactNode;
  onEditOpenChange?: (isEditing: boolean) => void;
}

export function ProfileSummarySection({
  title,
  icon,
  isEmpty,
  emptyLabel,
  renderSummary,
  renderEdit,
  onEditOpenChange,
}: ProfileSummarySectionProps) {
  const [isEditing, setIsEditing] = useState(false);

  const setEditing = (value: boolean) => {
    setIsEditing(value);
    onEditOpenChange?.(value);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-heading text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <Button variant="ghost" size="sm" className="gap-1 text-caption" onClick={() => setEditing(!isEditing)}>
          {isEditing ? (
            <>
              <Check className="h-3.5 w-3.5" /> Done
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </>
          )}
        </Button>
      </div>
      {isEditing ? (
        renderEdit(() => setEditing(false))
      ) : isEmpty ? (
        <p className="text-caption text-muted-foreground">{emptyLabel}</p>
      ) : (
        renderSummary()
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/ProfileSummarySection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/ProfileSummarySection.tsx frontend/src/components/profile/ProfileSummarySection.test.tsx
git commit -m "feat: add ProfileSummarySection summary/edit toggle wrapper"
```

---

### Task 3: Build `SkillsSection`

**Files:**
- Create: `frontend/src/components/profile/SkillsSection.tsx`
- Create: `frontend/src/components/profile/SkillsSection.test.tsx`

**Interfaces:**
- Consumes: `ProfileSummarySection` from Task 2.
- Produces: `SkillsSection({ skills: string[]; onChange: (skills: string[]) => void })` — chip summary + add/remove edit form (ported from `ProfileEditor`'s skills logic, including the `SKILL_SUGGESTIONS` autocomplete).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/SkillsSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillsSection } from "./SkillsSection";

describe("SkillsSection", () => {
  it("renders existing skills as chips in summary view", () => {
    render(<SkillsSection skills={["React", "TypeScript"]} onChange={vi.fn()} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("shows empty label when there are no skills", () => {
    render(<SkillsSection skills={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no skills added yet/i)).toBeInTheDocument();
  });

  it("adds a new skill on Enter in edit mode", () => {
    const onChange = vi.fn();
    render(<SkillsSection skills={["React"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByPlaceholderText(/type a skill/i);
    fireEvent.change(input, { target: { value: "Rust" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["React", "Rust"]);
  });

  it("removes a skill via its chip's remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<SkillsSection skills={["React", "TypeScript"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove react/i }));

    expect(onChange).toHaveBeenCalledWith(["TypeScript"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/SkillsSection.test.tsx`
Expected: FAIL with "Cannot find module './SkillsSection'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/SkillsSection.tsx
import { useState, useRef, KeyboardEvent } from "react";
import { Wrench, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileSummarySection } from "./ProfileSummarySection";

const SKILL_SUGGESTIONS = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Ruby",
  "React", "Next.js", "Vue.js", "Node.js", "SQL", "AWS", "Docker", "Kubernetes",
  "Git", "TensorFlow", "PyTorch", "GraphQL", "REST API",
];

interface SkillsSectionProps {
  skills: string[];
  onChange: (skills: string[]) => void;
}

export function SkillsSection({ skills, onChange }: SkillsSectionProps) {
  const [skillInput, setSkillInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const skillInputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = skillInput.trim().length >= 2
    ? SKILL_SUGGESTIONS.filter(
        (s) => s.toLowerCase().includes(skillInput.toLowerCase()) && !skills.includes(s)
      ).slice(0, 8)
    : [];

  const addSkill = (skillName?: string) => {
    const skill = (skillName || skillInput).trim();
    if (!skill || skills.includes(skill)) return;
    onChange([...skills, skill]);
    setSkillInput("");
    setShowSuggestions(false);
    skillInputRef.current?.focus();
  };

  const removeSkill = (skill: string) => {
    onChange(skills.filter((s) => s !== skill));
  };

  const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      filteredSuggestions.length > 0 ? addSkill(filteredSuggestions[0]) : addSkill();
    }
    if (e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <ProfileSummarySection
      title="Skills"
      icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
      isEmpty={skills.length === 0}
      emptyLabel="No skills added yet."
      renderSummary={() => (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <Badge key={skill} variant="secondary">{skill}</Badge>
          ))}
        </div>
      )}
      renderEdit={() => (
        <div>
          <div className="relative mb-3">
            <div className="flex gap-2">
              <Input
                ref={skillInputRef}
                value={skillInput}
                onChange={(e) => { setSkillInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleSkillKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Type a skill and press Enter"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => addSkill()} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-10 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); addSkill(suggestion); }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  aria-label={`remove ${skill}`}
                  onClick={() => removeSkill(skill)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/SkillsSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/SkillsSection.tsx frontend/src/components/profile/SkillsSection.test.tsx
git commit -m "feat: add SkillsSection with summary/edit toggle"
```

---

### Task 4: Build `EducationSection`

**Files:**
- Create: `frontend/src/components/profile/EducationSection.tsx`
- Create: `frontend/src/components/profile/EducationSection.test.tsx`

**Interfaces:**
- Consumes: `ProfileSummarySection` from Task 2; `Education` type from `@/types/profile`.
- Produces: `EducationSection({ education: Education[]; onChange: (education: Education[]) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/EducationSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EducationSection } from "./EducationSection";
import type { Education } from "@/types/profile";

const edu: Education = { id: "e1", programme: "BSc Computer Science", university: "U of T", degree_year: "2026" };

describe("EducationSection", () => {
  it("shows a summary line per education entry", () => {
    render(<EducationSection education={[edu]} onChange={vi.fn()} />);
    expect(screen.getByText(/BSc Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/U of T/)).toBeInTheDocument();
  });

  it("shows empty label when there are no entries", () => {
    render(<EducationSection education={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no education added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<EducationSection education={[edu]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      edu,
      expect.objectContaining({ programme: "", university: "", degree_year: "" }),
    ]);
  });

  it("removes an entry via its remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<EducationSection education={[edu]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove education/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/EducationSection.test.tsx`
Expected: FAIL with "Cannot find module './EducationSection'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/EducationSection.tsx
import { GraduationCap, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Education } from "@/types/profile";
import { ProfileSummarySection } from "./ProfileSummarySection";

interface EducationSectionProps {
  education: Education[];
  onChange: (education: Education[]) => void;
}

export function EducationSection({ education, onChange }: EducationSectionProps) {
  const addEducation = () => {
    onChange([...education, { id: crypto.randomUUID(), programme: "", university: "", degree_year: "" }]);
  };

  const updateEducation = (id: string, field: keyof Education, value: string) => {
    onChange(education.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeEducation = (id: string) => {
    onChange(education.filter((e) => e.id !== id));
  };

  return (
    <ProfileSummarySection
      title="Education"
      icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
      isEmpty={education.length === 0}
      emptyLabel="No education added yet."
      renderSummary={() => (
        <div className="space-y-1">
          {education.map((e) => (
            <p key={e.id} className="text-sm text-foreground">
              {e.programme}{e.programme && e.university ? ", " : ""}{e.university}
              {e.degree_year ? ` (${e.degree_year})` : ""}
            </p>
          ))}
        </div>
      )}
      renderEdit={() => (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={addEducation} className="gap-1 text-caption">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {education.map((edu) => (
            <div key={edu.id} className="rounded-lg border border-border p-3 space-y-2 relative">
              <button
                aria-label="remove education entry"
                onClick={() => removeEducation(edu.id)}
                className="absolute top-2 right-2 rounded-full p-1 hover:bg-destructive/10 text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Programme</Label>
                  <Input value={edu.programme} onChange={(e) => updateEducation(edu.id, "programme", e.target.value)} placeholder="BSc Computer Science" />
                </div>
                <div>
                  <Label>University</Label>
                  <Input value={edu.university} onChange={(e) => updateEducation(edu.id, "university", e.target.value)} placeholder="University of Toronto" />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input value={edu.degree_year || ""} onChange={(e) => updateEducation(edu.id, "degree_year", e.target.value)} placeholder="2026" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/EducationSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/EducationSection.tsx frontend/src/components/profile/EducationSection.test.tsx
git commit -m "feat: add EducationSection with summary/edit toggle"
```

---

### Task 5: Build `ExperienceSection`

**Files:**
- Create: `frontend/src/components/profile/ExperienceSection.tsx`
- Create: `frontend/src/components/profile/ExperienceSection.test.tsx`

**Interfaces:**
- Consumes: `ProfileSummarySection` from Task 2; `Experience` type from `@/types/profile`.
- Produces: `ExperienceSection({ experiences: Experience[]; onChange: (experiences: Experience[]) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/ExperienceSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExperienceSection } from "./ExperienceSection";
import type { Experience } from "@/types/profile";

const exp: Experience = {
  id: "x1", title: "Product Intern", company: "TechStart Inc.",
  start_date: "May 2024", end_date: "Aug 2024", description: "Built stuff", outcomes: ["Shipped a feature"],
};

describe("ExperienceSection", () => {
  it("shows a summary line per experience entry", () => {
    render(<ExperienceSection experiences={[exp]} onChange={vi.fn()} />);
    expect(screen.getByText(/Product Intern/)).toBeInTheDocument();
    expect(screen.getByText(/TechStart Inc\./)).toBeInTheDocument();
  });

  it("shows empty label when there are no entries", () => {
    render(<ExperienceSection experiences={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no experiences added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<ExperienceSection experiences={[exp]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      exp,
      expect.objectContaining({ title: "", company: "", start_date: "", description: "", outcomes: [] }),
    ]);
  });

  it("removes an entry via its remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<ExperienceSection experiences={[exp]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove experience/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/ExperienceSection.test.tsx`
Expected: FAIL with "Cannot find module './ExperienceSection'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/ExperienceSection.tsx
import { useState } from "react";
import { Briefcase, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Experience } from "@/types/profile";
import { ProfileSummarySection } from "./ProfileSummarySection";

interface ExperienceSectionProps {
  experiences: Experience[];
  onChange: (experiences: Experience[]) => void;
}

export function ExperienceSection({ experiences, onChange }: ExperienceSectionProps) {
  const [rawOutcomeInputs, setRawOutcomeInputs] = useState<Record<string, string>>({});

  const addExperience = () => {
    onChange([...experiences, {
      id: crypto.randomUUID(), title: "", company: "", start_date: "", end_date: "", description: "", outcomes: [],
    }]);
  };

  const updateExperience = (id: string, field: keyof Experience, value: string | string[]) => {
    onChange(experiences.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeExperience = (id: string) => {
    onChange(experiences.filter((e) => e.id !== id));
  };

  return (
    <ProfileSummarySection
      title="Experience"
      icon={<Briefcase className="h-4 w-4 text-muted-foreground" />}
      isEmpty={experiences.length === 0}
      emptyLabel="No experiences added yet."
      renderSummary={() => (
        <div className="space-y-1">
          {experiences.map((e) => (
            <p key={e.id} className="text-sm text-foreground">
              <span className="font-medium">{e.title}</span>{e.title && e.company ? " · " : ""}{e.company}
            </p>
          ))}
        </div>
      )}
      renderEdit={() => (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={addExperience} className="gap-1 text-caption">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {experiences.map((exp) => (
            <div key={exp.id} className="rounded-lg border border-border p-4 space-y-3 relative">
              <button
                aria-label="remove experience entry"
                onClick={() => removeExperience(exp.id)}
                className="absolute top-3 right-3 rounded-full p-1 hover:bg-destructive/10 text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Title</Label>
                  <Input value={exp.title} onChange={(e) => updateExperience(exp.id, "title", e.target.value)} placeholder="Product Intern" />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input value={exp.company} onChange={(e) => updateExperience(exp.id, "company", e.target.value)} placeholder="TechStart Inc." />
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input value={exp.start_date} onChange={(e) => updateExperience(exp.id, "start_date", e.target.value)} placeholder="May 2024" />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input value={exp.end_date || ""} onChange={(e) => updateExperience(exp.id, "end_date", e.target.value)} placeholder="Aug 2024 (or blank for present)" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={exp.description}
                  onChange={(e) => updateExperience(exp.id, "description", e.target.value)}
                  placeholder="What did you do in this role?"
                  className="min-h-[60px] resize-none text-sm"
                />
              </div>
              <div>
                <Label>Outcomes (one per line)</Label>
                <Textarea
                  value={rawOutcomeInputs[exp.id] ?? (exp.outcomes || []).join("\n")}
                  onChange={(e) => setRawOutcomeInputs((prev) => ({ ...prev, [exp.id]: e.target.value }))}
                  onBlur={(e) => {
                    const parsed = e.target.value.split("\n").filter((o) => o.trim());
                    updateExperience(exp.id, "outcomes", parsed);
                    setRawOutcomeInputs((prev) => ({ ...prev, [exp.id]: parsed.join("\n") }));
                  }}
                  placeholder="Reduced onboarding drop off by 22%"
                  className="min-h-[50px] resize-none text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/ExperienceSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/ExperienceSection.tsx frontend/src/components/profile/ExperienceSection.test.tsx
git commit -m "feat: add ExperienceSection with summary/edit toggle"
```

---

### Task 6: Build `ProjectsSection`

**Files:**
- Create: `frontend/src/components/profile/ProjectsSection.tsx`
- Create: `frontend/src/components/profile/ProjectsSection.test.tsx`

**Interfaces:**
- Consumes: `ProfileSummarySection` from Task 2; `Project` type from `@/types/profile`.
- Produces: `ProjectsSection({ projects: Project[]; onChange: (projects: Project[]) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/ProjectsSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectsSection } from "./ProjectsSection";
import type { Project } from "@/types/profile";

const proj: Project = { id: "p1", name: "Analytics Dashboard", description: "A dashboard", technologies: ["React"], outcomes: ["Used by 500+ students"] };

describe("ProjectsSection", () => {
  it("shows a summary line per project", () => {
    render(<ProjectsSection projects={[proj]} onChange={vi.fn()} />);
    expect(screen.getByText(/Analytics Dashboard/)).toBeInTheDocument();
  });

  it("shows empty label when there are no projects", () => {
    render(<ProjectsSection projects={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no projects added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<ProjectsSection projects={[proj]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      proj,
      expect.objectContaining({ name: "", description: "", technologies: [], outcomes: [] }),
    ]);
  });

  it("removes an entry via its remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<ProjectsSection projects={[proj]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove project/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/ProjectsSection.test.tsx`
Expected: FAIL with "Cannot find module './ProjectsSection'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/ProjectsSection.tsx
import { useState } from "react";
import { FolderOpen, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/types/profile";
import { ProfileSummarySection } from "./ProfileSummarySection";

interface ProjectsSectionProps {
  projects: Project[];
  onChange: (projects: Project[]) => void;
}

export function ProjectsSection({ projects, onChange }: ProjectsSectionProps) {
  const [rawTechInputs, setRawTechInputs] = useState<Record<string, string>>({});
  const [rawOutcomeInputs, setRawOutcomeInputs] = useState<Record<string, string>>({});

  const addProject = () => {
    onChange([...projects, { id: crypto.randomUUID(), name: "", description: "", technologies: [], outcomes: [] }]);
  };

  const updateProject = (id: string, field: keyof Project, value: string | string[]) => {
    onChange(projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removeProject = (id: string) => {
    onChange(projects.filter((p) => p.id !== id));
  };

  return (
    <ProfileSummarySection
      title="Projects"
      icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
      isEmpty={projects.length === 0}
      emptyLabel="No projects added yet."
      renderSummary={() => (
        <div className="space-y-1">
          {projects.map((p) => (
            <p key={p.id} className="text-sm text-foreground">{p.name}</p>
          ))}
        </div>
      )}
      renderEdit={() => (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={addProject} className="gap-1 text-caption">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {projects.map((proj) => (
            <div key={proj.id} className="rounded-lg border border-border p-4 space-y-3 relative">
              <button
                aria-label="remove project entry"
                onClick={() => removeProject(proj.id)}
                className="absolute top-3 right-3 rounded-full p-1 hover:bg-destructive/10 text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div>
                <Label>Project Name</Label>
                <Input value={proj.name} onChange={(e) => updateProject(proj.id, "name", e.target.value)} placeholder="Analytics Dashboard" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={proj.description}
                  onChange={(e) => updateProject(proj.id, "description", e.target.value)}
                  placeholder="What was this project about?"
                  className="min-h-[60px] resize-none text-sm"
                />
              </div>
              <div>
                <Label>Technologies (comma separated)</Label>
                <Input
                  value={rawTechInputs[proj.id] ?? (proj.technologies || []).join(", ")}
                  onChange={(e) => setRawTechInputs((prev) => ({ ...prev, [proj.id]: e.target.value }))}
                  onBlur={(e) => {
                    const parsed = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                    updateProject(proj.id, "technologies", parsed);
                    setRawTechInputs((prev) => ({ ...prev, [proj.id]: parsed.join(", ") }));
                  }}
                  placeholder="React, Python, PostgreSQL"
                />
              </div>
              <div>
                <Label>Outcomes (one per line)</Label>
                <Textarea
                  value={rawOutcomeInputs[proj.id] ?? (proj.outcomes || []).join("\n")}
                  onChange={(e) => setRawOutcomeInputs((prev) => ({ ...prev, [proj.id]: e.target.value }))}
                  onBlur={(e) => {
                    const parsed = e.target.value.split("\n").filter((o) => o.trim());
                    updateProject(proj.id, "outcomes", parsed);
                    setRawOutcomeInputs((prev) => ({ ...prev, [proj.id]: parsed.join("\n") }));
                  }}
                  placeholder="Used by 500+ students"
                  className="min-h-[50px] resize-none text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/ProjectsSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/ProjectsSection.tsx frontend/src/components/profile/ProjectsSection.test.tsx
git commit -m "feat: add ProjectsSection with summary/edit toggle"
```

---

### Task 7: Build `ProfileColumn`

**Files:**
- Create: `frontend/src/components/profile/ProfileColumn.tsx`
- Create: `frontend/src/components/profile/ProfileColumn.test.tsx`

**Interfaces:**
- Consumes: `SkillsSection`, `EducationSection`, `ExperienceSection`, `ProjectsSection` (Tasks 3–6); `loadProfile`, `saveProfile`, `isProfileComplete` from `@/lib/profile`; `extractTextFromFile` from `@/lib/fileTextExtractor`; `addDocument`, `loadDocuments` from `@/lib/documents`; `CandidateProfile` type.
- Produces:
```ts
interface ProfileColumnProps {
  profile: CandidateProfile;
  onProfileChange: (profile: CandidateProfile) => void;
}
```
`ProfileColumn` is uncontrolled with respect to persistence — every field change calls `onProfileChange` with the full updated profile immediately (autosave via `saveProfile`, no separate "Save" button, since there's no sheet to close). `Index.tsx` (Task 8) is expected to call `saveProfile(profile)` inside its `onProfileChange` handler, mirroring how `setProfile` already works today.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/profile/ProfileColumn.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileColumn } from "./ProfileColumn";
import { DEFAULT_PROFILE } from "@/lib/profile";
import type { CandidateProfile } from "@/types/profile";

describe("ProfileColumn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an incomplete indicator when required fields are missing", () => {
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={vi.fn()} />);
    expect(screen.getByTestId("profile-completeness-dot")).toBeInTheDocument();
  });

  it("shows a complete indicator when name/email/location/phone are filled", () => {
    const complete: CandidateProfile = {
      ...DEFAULT_PROFILE, name: "Jane Doe", email: "jane@example.com", phone: "555-0100", location: "Toronto",
    };
    render(<ProfileColumn profile={complete} onProfileChange={vi.fn()} />);
    expect(screen.getByTestId("profile-completeness-check")).toBeInTheDocument();
  });

  it("calls onProfileChange when the name field is edited", () => {
    const onProfileChange = vi.fn();
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={onProfileChange} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });

    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane Doe" }));
  });

  it("renders the Skills, Experience, Education, and Projects sections", () => {
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={vi.fn()} />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/ProfileColumn.test.tsx`
Expected: FAIL with "Cannot find module './ProfileColumn'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/profile/ProfileColumn.tsx
import { useRef, useState } from "react";
import { User, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { CandidateProfile, Experience, Project } from "@/types/profile";
import { isProfileComplete } from "@/lib/profile";
import { addDocument } from "@/lib/documents";
import { extractTextFromFile } from "@/lib/fileTextExtractor";
import { SkillsSection } from "./SkillsSection";
import { EducationSection } from "./EducationSection";
import { ExperienceSection } from "./ExperienceSection";
import { ProjectsSection } from "./ProjectsSection";

const API_URL = import.meta.env.VITE_API_URL || "";

interface ProfileColumnProps {
  profile: CandidateProfile;
  onProfileChange: (profile: CandidateProfile) => void;
}

export function ProfileColumn({ profile, onProfileChange }: ProfileColumnProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const complete = isProfileComplete(profile);

  const update = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    onProfileChange({ ...profile, [key]: value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      toast.info("Extracting text from document...");
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length < 20) {
        throw new Error("Could not extract enough text from this file. Try a different format.");
      }

      addDocument({
        id: crypto.randomUUID(), filename: file.name, document_type: "resume",
        uploadedAt: new Date().toISOString(), extracted_text: text,
      });

      toast.info("Analyzing your resume with AI...");
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
      const newEducation = [...profile.education];
      if (extracted.programme || extracted.university || extracted.degree_year) {
        const hasMatch = newEducation.some(
          (e) => e.programme === extracted.programme && e.university === extracted.university
        );
        if (!hasMatch) {
          newEducation.push({
            id: crypto.randomUUID(), programme: extracted.programme || "",
            university: extracted.university || "", degree_year: extracted.degree_year || "",
          });
        }
      }

      onProfileChange({
        ...profile,
        name: extracted.name || profile.name,
        email: extracted.email || profile.email,
        phone: extracted.phone || profile.phone,
        location: extracted.location || profile.location,
        linkedin_url: extracted.linkedin_url || profile.linkedin_url,
        website_url: extracted.website_url || profile.website_url,
        education: newEducation,
        skills: extracted.skills?.length ? [...new Set([...profile.skills, ...extracted.skills])] : profile.skills,
        experiences: extracted.experiences?.length
          ? [
              ...profile.experiences,
              ...extracted.experiences
                .filter((exp: Omit<Experience, "id">) => !profile.experiences.some((e) => e.title === exp.title && e.company === exp.company))
                .map((exp: Omit<Experience, "id">) => ({ ...exp, id: crypto.randomUUID() })),
            ]
          : profile.experiences,
        projects: extracted.projects?.length
          ? [
              ...profile.projects,
              ...extracted.projects
                .filter((proj: Omit<Project, "id">) => !profile.projects.some((p) => p.name === proj.name))
                .map((proj: Omit<Project, "id">) => ({ ...proj, id: crypto.randomUUID() })),
            ]
          : profile.projects,
      });

      toast.success("Profile updated from your document!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Auto-fill failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFileUpload} className="hidden" />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full gap-2 border-dashed"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Extracting profile from document...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload Resume / CV to auto-fill
            </>
          )}
        </Button>
        <p className="text-caption text-muted-foreground mt-1.5 text-center">
          Supports PDF, DOCX, and TXT. Existing fields won't be overwritten if already filled.
        </p>
      </div>

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-heading text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> Personal Information
          </h3>
          {complete ? (
            <CheckCircle2 data-testid="profile-completeness-check" className="h-4 w-4 text-green-600" />
          ) : (
            <div data-testid="profile-completeness-dot" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input id="name" value={profile.name} onChange={(e) => update("name", e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" value={profile.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" value={profile.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(416) 555 0199" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="location">Location *</Label>
            <Input id="location" value={profile.location} onChange={(e) => update("location", e.target.value)} placeholder="Toronto, Ontario" />
          </div>
        </div>
      </section>

      <Separator />

      <SkillsSection skills={profile.skills} onChange={(skills) => update("skills", skills)} />

      <Separator />

      <ExperienceSection experiences={profile.experiences} onChange={(experiences) => update("experiences", experiences)} />

      <Separator />

      <EducationSection education={profile.education} onChange={(education) => update("education", education)} />

      <Separator />

      <ProjectsSection projects={profile.projects} onChange={(projects) => update("projects", projects)} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/ProfileColumn.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile/ProfileColumn.tsx frontend/src/components/profile/ProfileColumn.test.tsx
git commit -m "feat: add ProfileColumn assembling all profile sections inline"
```

---

### Task 8: Wire `ProfileColumn` into `Index.tsx`, remove `ProfileEditor` sheet, update `IconRail`

**Files:**
- Modify: `frontend/src/pages/Index.tsx`
- Modify: `frontend/src/components/IconRail.tsx`
- Delete: `frontend/src/components/ProfileEditor.tsx`

**Interfaces:**
- Consumes: `ProfileColumn` from Task 7 (`{ profile, onProfileChange }`).
- Produces: `Index.tsx` gains an `onProfileChange` handler that calls `saveProfile(next)` then `setProfile(next)`, replacing the old `onProfileSaved` callback passed to the sheet.

This task does not yet build the final 3-column grid or accordion behavior (that's Task 10) — it only removes the sheet and renders `ProfileColumn` as a plain new left-hand block above/alongside the existing 2-column grid, so the change stays reviewable in isolation. `IconRail`'s Profile avatar button is removed since there is no longer a sheet for it to open.

- [ ] **Step 1: Update `IconRail.tsx`**

Remove the `onOpenProfile` prop, the `profileReady` prop, and the entire Profile `Tooltip`/`Avatar` block (lines for the profile button). Keep the Documents, History, Instructions, and theme-toggle buttons as they are (Documents already added in Task 1).

```ts
interface IconRailProps {
  onOpenDocuments: () => void;
  onOpenInstructions: () => void;
  onToggleHistory: () => void;
  historyCount: number;
  historyActive: boolean;
  mounted: boolean;
  theme: string | undefined;
  onToggleTheme: () => void;
}
```

Remove the now-unused `User`, `AlertCircle`, `Avatar`, `AvatarFallback` imports.

- [ ] **Step 2: Update `Index.tsx`**

- Remove `showProfile` state and the `<ProfileEditor open={showProfile} ... />` render at the bottom.
- Remove the `!profileReady` amber banner block (lines 452–460) — completeness is now shown inline in `ProfileColumn`.
- Remove the `onOpenProfile`/`profileReady` props passed to `<IconRail />`.
- Add:
```tsx
const handleProfileChange = (next: CandidateProfile) => {
  saveProfile(next);
  setProfile(next);
};
```
- Import `ProfileColumn` from `@/components/profile/ProfileColumn` and `saveProfile` from `@/lib/profile` (already imported as `loadProfile`; add `saveProfile` to that import).
- Render `<ProfileColumn profile={profile} onProfileChange={handleProfileChange} />` as a new column immediately to the left of the existing `JobFitPanel`/`CoverLetterPanel` grid (temporary placement — Task 10 finalizes the responsive 3-column grid).
- Update the `handleAnalyzeMatch` and `handleGenerate` early-return guards: they currently call `setShowProfile(true)` when `!profileReady` — since there's no sheet to open anymore, replace `setShowProfile(true);` with nothing (just the `toast.error(...)` remains); the inline `ProfileColumn` is always visible so there's nothing to "open".
- Delete `frontend/src/components/ProfileEditor.tsx` entirely.

- [ ] **Step 3: Run the full frontend test suite to check for breakage**

Run: `cd frontend && npx vitest run`
Expected: PASS — no test currently imports `ProfileEditor` directly (only `apiProfile.test.ts` and `example.test.ts` pre-exist, plus the new Task 1–7 test files), so removing it should not break existing tests.

- [ ] **Step 4: Manually verify in the browser**

Run the dev server, confirm: profile fields are visible without opening any sheet, editing a skill/education/experience/project section works and persists across a page reload (localStorage), the icon rail no longer has a Profile avatar button, uploading a resume via the new inline upload button still auto-fills fields.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Index.tsx frontend/src/components/IconRail.tsx
git rm frontend/src/components/ProfileEditor.tsx
git commit -m "feat: replace profile sheet with inline ProfileColumn"
```

---

### Task 9: Move History into a sheet (`HistorySheet`)

**Files:**
- Create: `frontend/src/components/HistorySheet.tsx`
- Modify: `frontend/src/pages/Index.tsx`
- Modify: `frontend/src/components/IconRail.tsx`

**Interfaces:**
- Consumes: `HistoryPanel` (unchanged) from `@/components/HistoryPanel`.
- Produces:
```ts
interface HistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: SavedCoverLetter[];
  onSelect: (item: SavedCoverLetter) => void;
  onDelete: (id: string) => void;
  activeId?: string;
  onHistoryUpdated: () => void;
}
```
Thin `Sheet` wrapper around the existing `HistoryPanel`, mirroring `InstructionsEditor`'s shape.

- [ ] **Step 1: Write the implementation** (no new business logic to test — `HistoryPanel` itself is unchanged and untested today; this is a pure layout wrapper, consistent with how `InstructionsEditor`/`ProfileEditor` were not unit-tested for their `Sheet` chrome)

```tsx
// frontend/src/components/HistorySheet.tsx
import { Clock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HistoryPanel } from "@/components/HistoryPanel";
import type { SavedCoverLetter } from "@/lib/history";

interface HistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: SavedCoverLetter[];
  onSelect: (item: SavedCoverLetter) => void;
  onDelete: (id: string) => void;
  activeId?: string;
  onHistoryUpdated: () => void;
}

export function HistorySheet({ open, onOpenChange, history, onSelect, onDelete, activeId, onHistoryUpdated }: HistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Saved Letters
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <HistoryPanel
            history={history}
            onSelect={(item) => { onSelect(item); onOpenChange(false); }}
            onDelete={onDelete}
            activeId={activeId}
            onHistoryUpdated={onHistoryUpdated}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Update `IconRail.tsx`**

Rename `onToggleHistory` to `onOpenHistory` (still opens; closing happens via the sheet's own `onOpenChange`), keep `historyCount` and `historyActive` (now means "sheet is open", used only for the `secondary` vs `ghost` button variant while open).

- [ ] **Step 3: Update `Index.tsx`**

- Replace the `showHistory` toggle grid-column block (the `{showHistory && (...)}` block wrapping a raw `<HistoryPanel>`) with `<HistorySheet open={showHistory} onOpenChange={setShowHistory} history={history} onSelect={handleSelectHistory} onDelete={handleDeleteHistory} activeId={activeId} onHistoryUpdated={handleHistoryUpdated} />` rendered alongside `DocumentsEditor`/`InstructionsEditor` at the bottom.
- Change the grid `className` template so it no longer branches on `showHistory` (`lg:grid-cols-[280px_1fr_1fr]` vs `lg:grid-cols-2`) — Task 10 replaces this grid entirely, so for this task just remove the History-column branch and leave a plain 2-column grid (Profile column added in Task 8 makes it 3 columns already; this task only removes the History-specific branching logic, not the final responsive grid).
- Update the `onToggleHistory={() => setShowHistory((v) => !v)}` prop passed to `<IconRail />` to `onOpenHistory={() => setShowHistory(true)}`.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 5: Manually verify in the browser**

Confirm clicking the History icon opens a sheet (not an inline column), selecting a saved letter loads it and closes the sheet, deleting a letter works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HistorySheet.tsx frontend/src/pages/Index.tsx frontend/src/components/IconRail.tsx
git commit -m "feat: move saved-letters history into an icon-rail sheet"
```

---

### Task 10: Build the responsive 3-column dashboard grid with collapsible accordion sections

**Files:**
- Create: `frontend/src/lib/dashboardLayout.ts`
- Create: `frontend/src/lib/dashboardLayout.test.ts`
- Modify: `frontend/src/pages/Index.tsx`

**Interfaces:**
- Produces:
```ts
export type DashboardSectionId = "profile" | "jobMatch" | "coverLetter";

export function getDefaultExpandedSections(params: {
  profileComplete: boolean;
  hasCoverLetter: boolean;
}): DashboardSectionId[];
```
Pure function extracted so the default-expand logic (spec: "Profile expanded if incomplete, collapsed if complete; Job & Match expanded; Cover Letter collapsed until a letter exists") is unit-testable without rendering the whole page. `Index.tsx` calls this once on mount (via `useState(() => getDefaultExpandedSections(...))`) to seed which `Accordion` items start open on narrow screens.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/dashboardLayout.test.ts
import { describe, it, expect } from "vitest";
import { getDefaultExpandedSections } from "./dashboardLayout";

describe("getDefaultExpandedSections", () => {
  it("expands profile and job-match, collapses cover letter when profile is incomplete and no letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: false, hasCoverLetter: false });
    expect(result).toEqual(["profile", "jobMatch"]);
  });

  it("collapses profile, expands job-match, collapses cover letter when profile is complete and no letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: true, hasCoverLetter: false });
    expect(result).toEqual(["jobMatch"]);
  });

  it("collapses profile, expands job-match and cover letter when profile is complete and a letter exists", () => {
    const result = getDefaultExpandedSections({ profileComplete: true, hasCoverLetter: true });
    expect(result).toEqual(["jobMatch", "coverLetter"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/dashboardLayout.test.ts`
Expected: FAIL with "Cannot find module './dashboardLayout'"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/dashboardLayout.ts
export type DashboardSectionId = "profile" | "jobMatch" | "coverLetter";

export function getDefaultExpandedSections(params: {
  profileComplete: boolean;
  hasCoverLetter: boolean;
}): DashboardSectionId[] {
  const sections: DashboardSectionId[] = [];
  if (!params.profileComplete) sections.push("profile");
  sections.push("jobMatch");
  if (params.hasCoverLetter) sections.push("coverLetter");
  return sections;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/dashboardLayout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire the grid and accordion into `Index.tsx`**

Remove the `StepCard` function and the "Step 1-4" grid block (lines 463–468 and the `StepCard` function at the bottom of the file) entirely — no replacement, per the approved design.

Replace the columns grid (previously the `showHistory`-branching grid from Task 9) with:

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getDefaultExpandedSections } from "@/lib/dashboardLayout";
```

```tsx
const [expandedSections, setExpandedSections] = useState<string[]>(() =>
  getDefaultExpandedSections({ profileComplete: isProfileComplete(profile), hasCoverLetter: false })
);
```

```tsx
<div className="grid gap-5 md:flex-1 md:min-h-0 lg:grid-cols-3">
  <div className="lg:hidden">
    <Accordion type="multiple" value={expandedSections} onValueChange={setExpandedSections} className="space-y-3">
      <AccordionItem value="profile" className="rounded-xl border border-border/50 bg-card px-4">
        <AccordionTrigger className="text-heading text-foreground">Profile</AccordionTrigger>
        <AccordionContent>
          <ProfileColumn profile={profile} onProfileChange={handleProfileChange} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="jobMatch" className="rounded-xl border border-border/50 bg-card px-4">
        <AccordionTrigger className="text-heading text-foreground">Job &amp; Match</AccordionTrigger>
        <AccordionContent>
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
            analysis={analysisIsCurrent ? matchAnalysis : null}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyzeMatch}
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="coverLetter" className="rounded-xl border border-border/50 bg-card px-4">
        <AccordionTrigger className="text-heading text-foreground">Cover Letter</AccordionTrigger>
        <AccordionContent>
          <CoverLetterPanel
            canGenerate={Boolean(input.trim())}
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>

  <div className="hidden lg:block rounded-xl border border-border/50 bg-card p-4 overflow-y-auto">
    <ProfileColumn profile={profile} onProfileChange={handleProfileChange} />
  </div>
  <div className="hidden lg:block">
    <JobFitPanel /* same props as above */ />
  </div>
  <div className="hidden lg:block">
    <CoverLetterPanel /* same props as above */ />
  </div>
</div>
```

(Duplicate the exact same prop lists shown in the accordion version for the `lg:block` copies — same components, just rendered twice: once inside `AccordionContent` for `<lg` screens, once in plain `div`s for `≥lg` screens. This avoids conditionally re-parenting the same component instances between an accordion and a grid, which would remount them and lose in-progress state on resize.)

Update `expandedSections` to resync when a cover letter is first generated: in `handleGenerate`'s success path (after `setCoverLetter(data.cover_letter_text)`), add:
```tsx
setExpandedSections((prev) => prev.includes("coverLetter") ? prev : [...prev, "coverLetter"]);
```

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 7: Manually verify responsive behavior**

Run the dev server, resize the browser below the `lg` breakpoint (1024px), confirm the three sections render as collapsible accordion items (Profile expanded if incomplete, Job & Match always expanded by default, Cover Letter collapsed until generated), confirm collapsing/expanding one section doesn't affect the others' state, confirm widening back above `lg` shows all three permanently side-by-side with no accordion chrome.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/dashboardLayout.ts frontend/src/lib/dashboardLayout.test.ts frontend/src/pages/Index.tsx
git commit -m "feat: build responsive 3-column dashboard with collapsible mobile accordion"
```

---

### Task 11: Full-suite verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (pre-existing `apiProfile.test.ts`, `example.test.ts`, plus all new tests from Tasks 1–10).

- [ ] **Step 2: Run the backend test suite (should be unaffected, confirming no accidental backend edits)**

Run: `cd backend && npm test`
Expected: All tests pass, same count as before this plan started.

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Manual end-to-end walkthrough in the browser**

Using the `run` skill or `npm run dev`, walk through the full spec's Testing checklist:
- Profile is visible without opening any sheet.
- Upload a resume → extraction fills the contact mini-form and populates Skills/Experience/Education inline, no page navigation.
- Toggle a section's Edit mode independently — editing Skills doesn't affect Education's view state.
- Paste a job posting, run Analyze — Job & Match column shows match score/gaps unchanged from before this refactor.
- Generate a cover letter — Cover Letter column behaves unchanged, and (on narrow screens) its accordion section auto-expands once the letter exists.
- Icon rail: Documents, Instructions, and History all open as sheets; there is no Profile icon anymore.
- Resize to a narrow width and confirm accordion collapse/expand works without losing typed-but-unsaved edit state on an open section.

- [ ] **Step 5: Report results**

No commit for this task — it's a verification gate. If any check fails, return to the relevant task above and fix before considering the plan complete.
