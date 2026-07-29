import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileColumn } from "./ProfileColumn";
import { DEFAULT_PROFILE } from "@/lib/profile";
import type { CandidateProfile } from "@/types/profile";

// pdfjs-dist (imported transitively via fileTextExtractor) crashes under
// jsdom because it references DOMMatrix, which jsdom doesn't implement.
// Mock it out, mirroring the existing pattern in DocumentsEditor.test.tsx.
vi.mock("@/lib/fileTextExtractor", () => ({
  extractTextFromFile: vi.fn(async () => "extracted text"),
}));

describe("ProfileColumn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an incomplete indicator when required fields are missing", () => {
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={vi.fn()} />);
    expect(screen.getByTestId("profile-completeness-dot")).toBeInTheDocument();
  });

  it("shows a complete indicator when name/email/location/phone are filled", () => {
    const complete: CandidateProfile = {
      ...DEFAULT_PROFILE, name: "Jane Doe", email: "jane@example.com", phone: "555-0100", location: "Toronto",
    };
    render(<ProfileColumn profile={complete} onProfileChange={vi.fn()} />);
    expect(screen.getByTestId("profile-completeness-check")).toBeInTheDocument();
  });

  it("calls onProfileChange when the name field is edited", () => {
    const onProfileChange = vi.fn();
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={onProfileChange} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });

    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane Doe" }));
  });

  it("renders the Skills, Experience, Education, and Projects sections", () => {
    render(<ProfileColumn profile={{ ...DEFAULT_PROFILE }} onProfileChange={vi.fn()} />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });
});
