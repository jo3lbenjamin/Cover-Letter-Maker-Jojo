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
import { resumeStore, MAX_RESUMES } from "@/lib/resumeStore";
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
    if (resumeStore.list().length >= MAX_RESUMES) {
      toast.error(`Resume library is full (max ${MAX_RESUMES}). Delete one first.`);
      return;
    }
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
