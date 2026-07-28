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
