import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PeriodTarget = { target_value: number | null; target_binary: boolean | null };

export type KpiCardData = {
  id: string;
  /** corporate_kpis.id or department_kpis.id — only set for board items, not library */
  board_kpi_id?: string;
  title: string;
  description?: string | null;
  driver: "growth" | "efficiency" | "culture";
  kpi_type: "progressive" | "binary" | "benchmark";
  unit: string | null;
  /** All period targets keyed by period string (q1, q2, h1, q3, q4, h2, fullyear). */
  period_targets?: Record<string, PeriodTarget>;
  /** Convenience accessor kept for backward compat — mirrors period_targets.fullyear.target_value */
  yearend_target_value: number | null;
  yearend_target_binary: boolean | null;
  // Only populated for library cards
  source_label?: "Corporate" | "Department" | null;
  dept_name?: string | null;
  func_name?: string | null;
  /** Title of the linked corporate KPI (dept KPIs only) */
  corp_kpi_title?: string | null;
  /** corporate_kpis.id that this dept KPI is linked to (dept KPIs only) */
  corp_kpi_id?: string | null;
  /** Dept KPI titles that reference this corporate KPI (corporate KPIs only) */
  linked_dept_kpi_titles?: string[] | null;
};

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100", text: "text-green-800",  label: "Growth"     },
  efficiency: { bg: "bg-blue-100",  text: "text-blue-800",   label: "Efficiency" },
  culture:    { bg: "bg-amber-100", text: "text-amber-800",  label: "Culture"    },
};

const TYPE_LABEL: Record<string, string> = {
  progressive: "Progressive",
  binary:      "Binary",
  benchmark:   "Benchmark",
};

export type KpiCardSource = "library" | "corporate" | "department";

type Props = {
  kpi: KpiCardData;
  canEdit?: boolean;
  onEdit?: (kpi: KpiCardData) => void;
  onDelete?: (kpi: KpiCardData) => void;
};

export function KpiCard({ kpi, canEdit, onEdit, onDelete }: Props) {
  const ds = DRIVER_STYLE[kpi.driver] ?? DRIVER_STYLE.growth;
  const isBinary = kpi.kpi_type === "binary";

  let targetDisplay: string;
  if (isBinary) {
    targetDisplay =
      kpi.yearend_target_binary === true
        ? "✓ Achieved"
        : kpi.yearend_target_binary === false
          ? "✗ Not achieved"
          : "—";
  } else {
    targetDisplay =
      kpi.yearend_target_value != null
        ? `${kpi.yearend_target_value}${kpi.unit ? ` ${kpi.unit}` : ""}`
        : "—";
  }

  return (
    <Card className="shadow-sm group">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold leading-tight">{kpi.title}</p>
          {canEdit && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); onEdit?.(kpi); }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete?.(kpi); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-xs font-medium border-0", ds.bg, ds.text)}>
            {ds.label}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABEL[kpi.kpi_type]}
          </Badge>
          {kpi.source_label && (
            <Badge variant="outline" className="text-xs">
              {kpi.source_label === "Department" && kpi.dept_name
                ? `Department (${kpi.dept_name})`
                : kpi.source_label}
            </Badge>
          )}
          {kpi.func_name && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {kpi.func_name}
            </Badge>
          )}
          {kpi.corp_kpi_title && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              → {kpi.corp_kpi_title}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Full Year Target: <span className="font-medium text-foreground">{targetDisplay}</span>
        </p>
      </CardContent>
    </Card>
  );
}
