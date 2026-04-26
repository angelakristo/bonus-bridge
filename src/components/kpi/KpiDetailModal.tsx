import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type IndividualKpiDetail = {
  individual_kpi_id: string;
  title: string;
  description: string | null;
  driver: "growth" | "efficiency" | "culture";
  kpi_type: "progressive" | "binary" | "benchmark";
  unit: string | null;
  status: "draft" | "pending_approval" | "approved" | "rejected";
};

type TargetRow = {
  period: "q1" | "q2" | "q3" | "q4" | "h1" | "h2" | "halfyear" | "fullyear";
  target_value: number | null;
  target_binary: boolean | null;
};

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth: { bg: "bg-green-100", text: "text-green-800", label: "Growth" },
  efficiency: { bg: "bg-blue-100", text: "text-blue-800", label: "Efficiency" },
  culture: { bg: "bg-amber-100", text: "text-amber-800", label: "Culture" },
};

const TYPE_LABEL: Record<string, string> = {
  progressive: "Progressive",
  binary: "Binary",
  benchmark: "Benchmark",
};

const PERIOD_LABEL: Record<TargetRow["period"], string> = {
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  h1: "H1",
  halfyear: "H1",
  h2: "H2",
  fullyear: "Full Year",
};

const PERIOD_ORDER: TargetRow["period"][] = ["q1", "q2", "q3", "q4", "h1", "h2", "fullyear"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: IndividualKpiDetail | null;
};

export function KpiDetailModal({ open, onOpenChange, kpi }: Props) {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !kpi) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("individual_kpi_targets")
      .select("period, target_value, target_binary")
      .eq("individual_kpi_id", kpi.individual_kpi_id)
      .then(({ data }) => {
        if (cancelled) return;
        setTargets((data ?? []) as TargetRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kpi]);

  if (!kpi) return null;

  const ds = DRIVER_STYLE[kpi.driver];
  const isBinary = kpi.kpi_type === "binary";
  const targetByPeriod = new Map(targets.map((t) => [t.period, t]));

  // For binary KPIs show h1 (or legacy halfyear) and fullyear only.
  // For numeric, suppress legacy halfyear rows when h1 data is present.
  const visiblePeriods = isBinary
    ? (["h1", "halfyear", "fullyear"] as TargetRow["period"][]).filter(
        (p) => targetByPeriod.has(p) || p === "fullyear",
      )
    : PERIOD_ORDER.filter((p) => {
        if (p === "halfyear") return targetByPeriod.has("halfyear") && !targetByPeriod.has("h1");
        return true;
      });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kpi.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline" className={cn("border-0", ds.bg, ds.text)}>
              {ds.label}
            </Badge>
            <Badge variant="secondary">{TYPE_LABEL[kpi.kpi_type]}</Badge>
            {kpi.unit && <Badge variant="outline">Unit: {kpi.unit}</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {kpi.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <p className="text-sm">{kpi.description}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Targets</p>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visiblePeriods.map((p) => {
                  const t = targetByPeriod.get(p);
                  let display: string;
                  if (isBinary) {
                    display =
                      t?.target_binary === true
                        ? "✓ Achieved"
                        : t?.target_binary === false
                          ? "✗ Not"
                          : "—";
                  } else {
                    display =
                      t?.target_value != null
                        ? `${t.target_value}${kpi.unit ? ` ${kpi.unit}` : ""}`
                        : "—";
                  }
                  return (
                    <div key={p} className="rounded-md border bg-muted/20 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {PERIOD_LABEL[p]}
                      </p>
                      <p className="text-sm font-medium">{display}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
