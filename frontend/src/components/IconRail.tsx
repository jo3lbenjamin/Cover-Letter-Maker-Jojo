import { Settings, History, Sun, Moon, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconRailProps {
  onOpenDocuments: () => void;
  onOpenInstructions: () => void;
  onToggleHistory: () => void;
  historyCount: number;
  historyActive: boolean;
  mounted: boolean;
  theme: string | undefined;
  onToggleTheme: () => void;
}

export function IconRail({
  onOpenDocuments,
  onOpenInstructions,
  onToggleHistory,
  historyCount,
  historyActive,
  mounted,
  theme,
  onToggleTheme,
}: IconRailProps) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border/50 bg-card py-4">
      <img src="/logo.png" alt="CoverCraft" className="mb-2 h-8 w-8 rounded-md object-contain" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onOpenDocuments} className="h-10 w-10">
            <FileUp className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">My Documents</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={historyActive ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleHistory}
            className="relative h-10 w-10"
          >
            <History className="h-4 w-4" />
            {historyCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                {historyCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Saved Letters</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onOpenInstructions} className="h-10 w-10">
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Instructions</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} className="h-10 w-10">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </TooltipContent>
        </Tooltip>
      )}
    </nav>
  );
}
