import { useState } from "react";
import { FolderOpen, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Project } from "@/types/profile";
import { ProfileSummarySection } from "./ProfileSummarySection";

interface ProjectsSectionProps {
  projects: Project[];
  onChange: (projects: Project[]) => void;
}

export function ProjectsSection({ projects, onChange }: ProjectsSectionProps) {
  const [rawTechInputs, setRawTechInputs] = useState<Record<string, string>>({});
  const [rawOutcomeInputs, setRawOutcomeInputs] = useState<Record<string, string>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const addProject = () => {
    onChange([...projects, { id: crypto.randomUUID(), name: "", description: "", technologies: [], outcomes: [] }]);
  };

  const updateProject = (id: string, field: keyof Project, value: string | string[]) => {
    onChange(projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const confirmRemoveProject = () => {
    if (!pendingDeleteId) return;
    onChange(projects.filter((p) => p.id !== pendingDeleteId));
    toast.success("Project entry removed.");
    setPendingDeleteId(null);
  };

  return (
    <>
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
                onClick={() => setPendingDeleteId(proj.id)}
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
    <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this project entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this entry. Once deleted, it cannot be recovered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmRemoveProject}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
