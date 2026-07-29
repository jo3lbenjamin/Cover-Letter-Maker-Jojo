import { useState, useEffect, useRef } from "react";
import { FileUp, Plus, Loader2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { UploadedDocument } from "@/types/profile";
import { loadDocuments, addDocument, removeDocument } from "@/lib/documents";
import { extractTextFromFile } from "@/lib/fileTextExtractor";

interface DocumentsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentsEditor({ open, onOpenChange }: DocumentsEditorProps) {
  const [documents, setDocuments] = useState<UploadedDocument[]>(loadDocuments());
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDocuments(loadDocuments());
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      toast.info("Extracting text from document...");
      const text = await extractTextFromFile(file);

      addDocument({
        id: crypto.randomUUID(),
        filename: file.name,
        document_type: "portfolio",
        uploadedAt: new Date().toISOString(),
        extracted_text: text || "",
      });
      setDocuments(loadDocuments());
      toast.success(`Document "${file.name}" added to your library`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to process document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    removeDocument(pendingDeleteId);
    setDocuments(loadDocuments());
    toast.success("Document removed from library.");
    setPendingDeleteId(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            My Documents
          </SheetTitle>
          <SheetDescription>
            Upload portfolios, website PDFs, transcripts, or any supporting documents. The AI will use these as reference when writing your cover letters.
          </SheetDescription>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full gap-2 border-dashed"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Upload Document
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{doc.filename}</p>
                  <p className="text-caption text-muted-foreground">
                    {doc.document_type} &middot; {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove document"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setPendingDeleteId(doc.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {documents.length === 0 && (
            <p className="text-caption text-muted-foreground text-center py-4">
              No documents uploaded yet. Add resumes, portfolios, or other references.
            </p>
          )}
        </div>

        <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this entry. Once deleted, it cannot be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
