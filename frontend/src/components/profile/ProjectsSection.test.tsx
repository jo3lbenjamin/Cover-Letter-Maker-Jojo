import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectsSection } from "./ProjectsSection";
import type { Project } from "@/types/profile";

const proj: Project = { id: "p1", name: "Analytics Dashboard", description: "A dashboard", technologies: ["React"], outcomes: ["Used by 500+ students"] };

describe("ProjectsSection", () => {
  it("shows a summary line per project", () => {
    render(<ProjectsSection projects={[proj]} onChange={vi.fn()} />);
    expect(screen.getByText(/Analytics Dashboard/)).toBeInTheDocument();
  });

  it("shows empty label when there are no projects", () => {
    render(<ProjectsSection projects={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no projects added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<ProjectsSection projects={[proj]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      proj,
      expect.objectContaining({ name: "", description: "", technologies: [], outcomes: [] }),
    ]);
  });

  it("removes an entry via its remove button in edit mode after confirming", async () => {
    const onChange = vi.fn();
    render(<ProjectsSection projects={[proj]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove project/i }));

    const confirmButton = await screen.findByRole("button", { name: /yes, delete/i });
    fireEvent.click(confirmButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
