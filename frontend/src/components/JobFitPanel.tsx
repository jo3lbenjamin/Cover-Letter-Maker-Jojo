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
