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
