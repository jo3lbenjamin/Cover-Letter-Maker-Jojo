import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExperienceSection } from "./ExperienceSection";
import type { Experience } from "@/types/profile";

const exp: Experience = {
  id: "x1", title: "Product Intern", company: "TechStart Inc.",
  start_date: "May 2024", end_date: "Aug 2024", description: "Built stuff", outcomes: ["Shipped a feature"],
};

describe("ExperienceSection", () => {
  it("shows a summary line per experience entry", () => {
    render(<ExperienceSection experiences={[exp]} onChange={vi.fn()} />);
    expect(screen.getByText(/Product Intern/)).toBeInTheDocument();
    expect(screen.getByText(/TechStart Inc\./)).toBeInTheDocument();
  });

  it("shows empty label when there are no entries", () => {
    render(<ExperienceSection experiences={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no experiences added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<ExperienceSection experiences={[exp]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      exp,
      expect.objectContaining({ title: "", company: "", start_date: "", description: "", outcomes: [] }),
    ]);
  });

  it("removes an entry via its remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<ExperienceSection experiences={[exp]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove experience/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
