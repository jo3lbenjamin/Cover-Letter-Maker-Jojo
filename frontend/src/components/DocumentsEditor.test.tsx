import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DocumentsEditor } from "./DocumentsEditor";
import { addDocument } from "@/lib/documents";

vi.mock("@/lib/fileTextExtractor", () => ({
  extractTextFromFile: vi.fn(async () => "extracted text"),
}));

describe("DocumentsEditor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists existing documents and removes one on confirm", async () => {
    addDocument({
      id: "doc-1",
      filename: "portfolio.pdf",
      document_type: "portfolio",
      uploadedAt: new Date().toISOString(),
      extracted_text: "some text",
    });

    render(<DocumentsEditor open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("portfolio.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove document/i }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, delete/i }));

    await waitFor(() => {
      expect(screen.queryByText("portfolio.pdf")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when there are no documents", () => {
    render(<DocumentsEditor open={true} onOpenChange={() => {}} />);
    expect(screen.getByText(/no documents uploaded yet/i)).toBeInTheDocument();
  });
});
