import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Period = Database["public"]["Enums"]["period"];

const PERIODS: { value: Period; label: string }[] = [
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "halfyear", label: "Mid-Year" },
  { value: "fullyear", label: "Year-End" },
];

type PeriodToggleProps = {
  value: Period;
  onChange: (p: Period) => void;
};

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === p.value
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export type { Period };
