import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle } from "lucide-react";
import type { MatchAnalysisApiResponse, CategoryScores } from "@/types/jobFit";

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  skills: "Skills",
  experience: "Experience",
  keywords: "Keywords",
  education: "Education",
  technologies: "Technologies",
};

function scoreBadgeClass(score: number): string {
  if (score >= 90) return "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/50 dark:text-green-200";
  if (score >= 60) return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200";
  return "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200";
}

interface MatchResultsPanelProps {
  analysis: MatchAnalysisApiResponse;
  actions?: React.ReactNode;
}

export function MatchResultsPanel({ analysis, actions }: MatchResultsPanelProps) {
  const isHighMatch = analysis.overall_score >= 90;
  const totalRequirements =
    analysis.matched_requirements.length + analysis.missing_requirements.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {analysis.parsed_job.role_title} at {analysis.parsed_job.company_name}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {isHighMatch ? "Excellent match" : "Overall Match"}
          </p>
        </div>
        <div className={`rounded-full border px-4 py-1.5 text-2xl font-bold ${scoreBadgeClass(analysis.overall_score)}`}>
          {analysis.overall_score}%
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/50 bg-card p-4 sm:grid-cols-2">
        {(Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[]).map((cat) => (
          <div key={cat}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
              <span className="font-medium text-foreground">{analysis.category_scores[cat]}%</span>
            </div>
            <Progress value={analysis.category_scores[cat]} className="h-2" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Requirements Coverage</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Overall Match</dt>
            <dd className="font-medium text-foreground">{analysis.overall_score}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Matched Requirements</dt>
            <dd className="font-medium text-foreground">
              {analysis.matched_requirements.length} / {totalRequirements}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {isHighMatch ? "Critical Missing Skills (minor)" : "Critical Missing Skills"}
            </dt>
            <dd className="font-medium text-foreground">
              {analysis.critical_missing_skills.length > 0
                ? analysis.critical_missing_skills.join(", ")
                : "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {isHighMatch ? "Polish Suggestions" : "Resume Weaknesses"}
            </dt>
            <dd className="font-medium text-foreground">
              {analysis.weaknesses.length > 0 ? analysis.weaknesses.join("; ") : "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Estimated ATS Ranking</dt>
            <dd className="font-medium text-foreground">{analysis.estimated_ranking_band}</dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Matched</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.matched_requirements.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Missing</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.missing_requirements.map((r) => (
                <Badge key={r} variant="outline" className="gap-1 text-xs">
                  <XCircle className="h-3 w-3 text-muted-foreground" />
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {analysis.strengths.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Strengths</h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {analysis.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
