import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileSummarySection } from "./ProfileSummarySection";

describe("ProfileSummarySection", () => {
  it("shows the summary view by default and toggles to edit view on click", () => {
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={false}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>React, TypeScript</p>}
        renderEdit={(close) => <button onClick={close}>Done editing</button>}
      />
    );

    expect(screen.getByText("React, TypeScript")).toBeInTheDocument();
    expect(screen.queryByText("Done editing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByText("Done editing")).toBeInTheDocument();
    expect(screen.queryByText("React, TypeScript")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Done editing"));

    expect(screen.getByText("React, TypeScript")).toBeInTheDocument();
  });

  it("shows the empty label instead of the summary when isEmpty is true", () => {
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={true}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>React, TypeScript</p>}
        renderEdit={() => <div />}
      />
    );

    expect(screen.getByText("No skills added yet.")).toBeInTheDocument();
    expect(screen.queryByText("React, TypeScript")).not.toBeInTheDocument();
  });

  it("calls onEditOpenChange when toggled", () => {
    const onEditOpenChange = vi.fn();
    render(
      <ProfileSummarySection
        title="Skills"
        icon={<span />}
        isEmpty={false}
        emptyLabel="No skills added yet."
        renderSummary={() => <p>Summary</p>}
        renderEdit={() => <div>Edit</div>}
        onEditOpenChange={onEditOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEditOpenChange).toHaveBeenCalledWith(true);
  });
});
