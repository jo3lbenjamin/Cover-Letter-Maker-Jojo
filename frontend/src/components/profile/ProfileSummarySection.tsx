import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileSummarySectionProps {
  title: string;
  icon: React.ReactNode;
  isEmpty: boolean;
  emptyLabel: string;
  renderSummary: () => React.ReactNode;
  renderEdit: (close: () => void) => React.ReactNode;
  onEditOpenChange?: (isEditing: boolean) => void;
}

export function ProfileSummarySection({
  title,
  icon,
  isEmpty,
  emptyLabel,
  renderSummary,
  renderEdit,
  onEditOpenChange,
}: ProfileSummarySectionProps) {
  const [isEditing, setIsEditing] = useState(false);

  const setEditing = (value: boolean) => {
    setIsEditing(value);
    onEditOpenChange?.(value);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-heading text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <Button variant="ghost" size="sm" className="gap-1 text-caption" onClick={() => setEditing(!isEditing)}>
          {isEditing ? (
            <>
              <Check className="h-3.5 w-3.5" /> Done
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </>
          )}
        </Button>
      </div>
      {isEditing ? (
        renderEdit(() => setEditing(false))
      ) : isEmpty ? (
        <p className="text-caption text-muted-foreground">{emptyLabel}</p>
      ) : (
        renderSummary()
      )}
    </section>
  );
}
