export type DashboardSectionId = "profile" | "jobMatch" | "coverLetter";

export function getDefaultExpandedSections(params: {
  profileComplete: boolean;
  hasCoverLetter: boolean;
}): DashboardSectionId[] {
  const sections: DashboardSectionId[] = [];
  if (!params.profileComplete) sections.push("profile");
  sections.push("jobMatch");
  if (params.hasCoverLetter) sections.push("coverLetter");
  return sections;
}
