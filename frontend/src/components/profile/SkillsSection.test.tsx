import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillsSection } from "./SkillsSection";

describe("SkillsSection", () => {
  it("renders existing skills as chips in summary view", () => {
    render(<SkillsSection skills={["React", "TypeScript"]} onChange={vi.fn()} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("shows empty label when there are no skills", () => {
    render(<SkillsSection skills={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no skills added yet/i)).toBeInTheDocument();
  });

  it("adds a new skill on Enter in edit mode", () => {
    const onChange = vi.fn();
    render(<SkillsSection skills={["React"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByPlaceholderText(/type a skill/i);
    fireEvent.change(input, { target: { value: "Rust" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["React", "Rust"]);
  });

  it("removes a skill via its chip's remove button in edit mode", () => {
    const onChange = vi.fn();
    render(<SkillsSection skills={["React", "TypeScript"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove react/i }));

    expect(onChange).toHaveBeenCalledWith(["TypeScript"]);
  });
});
