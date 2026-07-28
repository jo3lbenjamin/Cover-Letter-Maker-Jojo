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
