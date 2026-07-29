import { useState, useRef, KeyboardEvent } from "react";
import { Wrench, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileSummarySection } from "./ProfileSummarySection";
import { SKILL_SUGGESTIONS } from "@/lib/skillSuggestions";

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
