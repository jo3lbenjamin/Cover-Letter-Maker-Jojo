import { Clock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HistoryPanel } from "@/components/HistoryPanel";
import type { SavedCoverLetter } from "@/lib/history";

interface HistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: SavedCoverLetter[];
  onSelect: (item: SavedCoverLetter) => void;
  onDelete: (id: string) => void;
  activeId?: string;
  onHistoryUpdated: () => void;
}

export function HistorySheet({ open, onOpenChange, history, onSelect, onDelete, activeId, onHistoryUpdated }: HistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Saved Letters
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <HistoryPanel
            history={history}
            onSelect={(item) => { onSelect(item); onOpenChange(false); }}
            onDelete={onDelete}
            activeId={activeId}
            onHistoryUpdated={onHistoryUpdated}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
