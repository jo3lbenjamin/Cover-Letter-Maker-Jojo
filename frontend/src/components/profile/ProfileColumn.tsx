import { useEffect, useId, useRef, useState } from "react";
import { User, Upload, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { CandidateProfile, Experience, Project } from "@/types/profile";
import { DEFAULT_PROFILE, isProfileComplete } from "@/lib/profile";
import { addDocument } from "@/lib/documents";
import { extractTextFromFile } from "@/lib/fileTextExtractor";
import { SkillsSection } from "./SkillsSection";
import { EducationSection } from "./EducationSection";
import { ExperienceSection } from "./ExperienceSection";
import { ProjectsSection } from "./ProjectsSection";

const API_URL = import.meta.env.VITE_API_URL || "";

interface ProfileColumnProps {
  profile: CandidateProfile;
  onProfileChange: (profile: CandidateProfile) => void;
}

export function ProfileColumn({ profile, onProfileChange }: ProfileColumnProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const complete = isProfileComplete(profile);
  const uid = useId();

  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  });

  const update = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    onProfileChange({ ...profile, [key]: value });
  };

  const handleResetProfile = () => {
    onProfileChange({ ...DEFAULT_PROFILE });
    toast.success("Profile has been reset to blank.");
    setShowResetConfirm(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      toast.info("Extracting text from document...");
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length < 20) {
        throw new Error("Could not extract enough text from this file. Try a different format.");
      }

      addDocument({
        id: crypto.randomUUID(), filename: file.name, document_type: "resume",
        uploadedAt: new Date().toISOString(), extracted_text: text,
      });

      toast.info("Analyzing your resume with AI...");
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
      const currentProfile = profileRef.current;
      const newEducation = [...currentProfile.education];
      if (extracted.programme || extracted.university || extracted.degree_year) {
        const hasMatch = newEducation.some(
          (e) => e.programme === extracted.programme && e.university === extracted.university
        );
        if (!hasMatch) {
          newEducation.push({
            id: crypto.randomUUID(), programme: extracted.programme || "",
            university: extracted.university || "", degree_year: extracted.degree_year || "",
          });
        }
      }

      onProfileChange({
        ...currentProfile,
        name: extracted.name || currentProfile.name,
        email: extracted.email || currentProfile.email,
        phone: extracted.phone || currentProfile.phone,
        location: extracted.location || currentProfile.location,
        linkedin_url: extracted.linkedin_url || currentProfile.linkedin_url,
        website_url: extracted.website_url || currentProfile.website_url,
        education: newEducation,
        skills: extracted.skills?.length ? [...new Set([...currentProfile.skills, ...extracted.skills])] : currentProfile.skills,
        experiences: extracted.experiences?.length
          ? [
              ...currentProfile.experiences,
              ...extracted.experiences
                .filter((exp: Omit<Experience, "id">) => !currentProfile.experiences.some((e) => e.title === exp.title && e.company === exp.company))
                .map((exp: Omit<Experience, "id">) => ({ ...exp, id: crypto.randomUUID() })),
            ]
          : currentProfile.experiences,
        projects: extracted.projects?.length
          ? [
              ...currentProfile.projects,
              ...extracted.projects
                .filter((proj: Omit<Project, "id">) => !currentProfile.projects.some((p) => p.name === proj.name))
                .map((proj: Omit<Project, "id">) => ({ ...proj, id: crypto.randomUUID() })),
            ]
          : currentProfile.projects,
      });

      toast.success("Profile updated from your document!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Auto-fill failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFileUpload} className="hidden" />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full gap-2 border-dashed"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Extracting profile from document...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload Resume / CV to auto-fill
            </>
          )}
        </Button>
        <p className="text-caption text-muted-foreground mt-1.5 text-center">
          Supports PDF, DOCX, and TXT. Existing fields won't be overwritten if already filled.
        </p>
      </div>

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-heading text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> Personal Information
          </h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-caption text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowResetConfirm(true)}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            {complete ? (
              <CheckCircle2 data-testid="profile-completeness-check" className="h-4 w-4 text-green-600" />
            ) : (
              <div data-testid="profile-completeness-dot" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor={`${uid}-name`}>Full Name *</Label>
            <Input id={`${uid}-name`} value={profile.name} onChange={(e) => update("name", e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <Label htmlFor={`${uid}-email`}>Email *</Label>
            <Input id={`${uid}-email`} type="email" value={profile.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <Label htmlFor={`${uid}-phone`}>Phone *</Label>
            <Input id={`${uid}-phone`} value={profile.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(416) 555 0199" />
          </div>
          <div className="col-span-2">
            <Label htmlFor={`${uid}-location`}>Location *</Label>
            <Input id={`${uid}-location`} value={profile.location} onChange={(e) => update("location", e.target.value)} placeholder="Toronto, Ontario" />
          </div>
        </div>
      </section>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset entire profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your profile data including personal info, education, skills, experiences, and projects. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetProfile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Separator />

      <SkillsSection skills={profile.skills} onChange={(skills) => update("skills", skills)} />

      <Separator />

      <ExperienceSection experiences={profile.experiences} onChange={(experiences) => update("experiences", experiences)} />

      <Separator />

      <EducationSection education={profile.education} onChange={(education) => update("education", education)} />

      <Separator />

      <ProjectsSection projects={profile.projects} onChange={(projects) => update("projects", projects)} />
    </div>
  );
}
