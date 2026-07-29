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
