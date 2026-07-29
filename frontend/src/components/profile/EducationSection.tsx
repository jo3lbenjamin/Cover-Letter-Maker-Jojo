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
