import { Link, useLocation } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { STEPS } from "./steps";
import type { Database } from "@/integrations/supabase/types";

type SetupStepStatus = Database["public"]["Enums"]["setup_step_status"];

export function SetupChecklist({
  progress,
  loading,
  className,
}: {
  progress: Record<string, SetupStepStatus>;
  loading: boolean;
  className?: string;
}) {
  const location = useLocation();

  return (
    <aside className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Setup Checklist
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Complete each step to finish configuring BonusBridge.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <ol className="space-y-1">
          {STEPS.map((step, idx) => {
            const status: SetupStepStatus = progress[step.key] ?? "not_started";
            const isComplete = status === "complete";
            const isActive = !!step.route && location.pathname === step.route;
            const hasRoute = !!step.route;

            const inner = (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                  isActive && "bg-accent/40 font-semibold",
                  hasRoute && !isActive && "hover:bg-accent/20",
                  !hasRoute && "opacity-60",
                )}
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium",
                        isActive
                          ? "border-foreground text-foreground"
                          : "border-muted-foreground/40 text-muted-foreground",
                      )}
                    >
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate leading-tight">{step.title}</div>
                  {!hasRoute && (
                    <div className="text-[11px] text-muted-foreground">Coming soon</div>
                  )}
                </div>
              </div>
            );

            return (
              <li key={step.key}>
                {hasRoute ? (
                  <Link to={step.route!} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div aria-disabled className="cursor-not-allowed">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
