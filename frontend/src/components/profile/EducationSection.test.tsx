import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EducationSection } from "./EducationSection";
import type { Education } from "@/types/profile";

const edu: Education = { id: "e1", programme: "BSc Computer Science", university: "U of T", degree_year: "2026" };

describe("EducationSection", () => {
  it("shows a summary line per education entry", () => {
    render(<EducationSection education={[edu]} onChange={vi.fn()} />);
    expect(screen.getByText(/BSc Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/U of T/)).toBeInTheDocument();
  });

  it("shows empty label when there are no entries", () => {
    render(<EducationSection education={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no education added yet/i)).toBeInTheDocument();
  });

  it("adds a new blank entry when Add is clicked in edit mode", () => {
    const onChange = vi.fn();
    render(<EducationSection education={[edu]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith([
      edu,
      expect.objectContaining({ programme: "", university: "", degree_year: "" }),
    ]);
  });

  it("removes an entry via its remove button in edit mode after confirming", async () => {
    const onChange = vi.fn();
    render(<EducationSection education={[edu]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove education/i }));

    const confirmButton = await screen.findByRole("button", { name: /yes, delete/i });
    fireEvent.click(confirmButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
