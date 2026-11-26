import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: ReactNode;
  sublabel?: string;
  icon?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning";
  className?: string;
}

const TONE_DOT: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "bg-muted-foreground/40",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
};

export function StatTile({ label, value, sublabel, icon, tone = "default", className }: StatTileProps) {
  return (
    <div className={cn("surface-panel p-4 flex flex-col justify-between gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
          {value}
        </div>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{sublabel}</p>
        )}
      </div>
    </div>
  );
}