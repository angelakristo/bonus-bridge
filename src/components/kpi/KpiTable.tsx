import { Pencil, Trash2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { KpiCardData } from "@/components/kpi/KpiCard";
import {
  deriveSinglePeriod,
  isDerivedPeriod,
  PERIOD_AGG_META,
  SCORING_TYPE_META,
  DERIVED_PERIODS as ENGINE_DERIVED_PERIODS,
} from "@/lib/kpi-engine";

export type KpiTableVariant = "library" | "corporate" | "department";

type Props = {
  kpis: KpiCardData[];
  variant: KpiTableVariant;
  loading?: boolean;
  onEdit?: (kpi: KpiCardData) => void;
  onDelete?: (kpi: KpiCardData) => void;
  isEditMode?: boolean;
  editingRows?: Record<string, KpiCardData>;
  onRowChange?: (kpiId: string, updated: KpiCardData) => void;
  isDeleteMode?: boolean;
  selectedForDelete?: Set<string>;
  onToggleSelect?: (kpiId: string) => void;
  corpKpisForLink?: { id: string; title: string }[];
};

/* ── Style maps ── */

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", label: "Growth"     },
  efficiency: { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-800 dark:text-blue-300",   label: "Efficiency" },
  culture:    { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", label: "Culture"    },
};

const LEGACY_TYPE_STYLE: Record<string, { label: string; className: string }> = {
  progressive: { label: "Progressive", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300" },
  binary:      { label: "Binary",      className: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"             },
  benchmark:   { label: "Benchmark",   className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
};

/** Return badge label + className for the type column, preferring new model. */
function getTypeBadge(kpi: KpiCardData): { label: string; className: string; scoringLabel?: string } {
  if (kpi.period_agg_type) {
    return {
      label: PERIOD_AGG_META[kpi.period_agg_type].shortLabel,
      className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
      scoringLabel: kpi.scoring_type ? SCORING_TYPE_META[kpi.scoring_type].label : undefined,
    };
  }
  return LEGACY_TYPE_STYLE[kpi.kpi_type] ?? LEGACY_TYPE_STYLE.progressive;
}

const LINK_COL_LABEL: Record<KpiTableVariant, string> = {
  library:    "Related KPI",
  corporate:  "Department KPI",
  department: "Corporate KPI",
};

/* ── Period columns ── */

const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

const BINARY_EDITABLE = new Set<Period>(["h1", "fullyear"]);

/* ── Helpers ── */

function isBinaryKpi(kpi: KpiCardData): boolean {
  return kpi.scoring_type === "binary" || (kpi.scoring_type == null && kpi.kpi_type === "binary");
}

function periodCell(kpi: KpiCardData, period: Period): string {
  const t = kpi.period_targets?.[period];
  if (isBinaryKpi(kpi)) {
    if (!BINARY_EDITABLE.has(period)) return "—";
    if (!t) return "—";
    return t.target_binary === true ? "✓" : t.target_binary === false ? "✗" : "—";
  }
  if (!t || t.target_value === null) return "—";
  return String(t.target_value);
}

const UNIT_OPTS = ["", "%", "EUR", "EUR M", "Count", "Score"] as const;

/* ── Component ── */

export function KpiTable({
  kpis, variant, loading,
  onEdit, onDelete,
  isEditMode, editingRows, onRowChange,
  isDeleteMode, selectedForDelete, onToggleSelect,
  corpKpisForLink,
}: Props) {
  const showTargets = true;
  const showActions = variant !== "library" && (!!onEdit || !!onDelete) && !isEditMode && !isDeleteMode;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {variant === "library"
          ? "No KPIs defined yet."
          : "No KPIs added yet. Click Add KPI to create one."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {isDeleteMode && <TableHead className="w-8 px-3" />}
            <TableHead className="w-40">Title</TableHead>
            <TableHead className="w-44">Description</TableHead>
            <TableHead className="w-28">Type</TableHead>
            <TableHead className="w-28">Driver</TableHead>
            <TableHead className="w-36">{LINK_COL_LABEL[variant]}</TableHead>
            <TableHead className="w-20">Unit</TableHead>
            {showTargets && PERIODS.map((p) => (
              <TableHead key={p} className="w-14 text-right">
                {PERIOD_LABEL[p]}
                {isEditMode && !ENGINE_DERIVED_PERIODS.has(p) && (
                  <span className="ml-0.5 text-[9px] text-blue-500">✎</span>
                )}
              </TableHead>
            ))}
            {showActions && <TableHead className="w-16 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {kpis.map((kpi) => {
            const row: KpiCardData = (isEditMode ? editingRows?.[kpi.id] : undefined) ?? kpi;
            const isSelected = !!(isDeleteMode && selectedForDelete?.has(kpi.id));
            const ds = DRIVER_STYLE[row.driver] ?? DRIVER_STYLE.growth;
            const tb = getTypeBadge(row);
            const isBinary = isBinaryKpi(row);

            const change = (updates: Partial<KpiCardData>) =>
              onRowChange?.(kpi.id, { ...row, ...updates } as KpiCardData);

            const changePeriod = (
              period: Period,
              updates: Partial<{ target_value: number | null; target_binary: boolean | null }>,
            ) => {
              const pt = { ...(row.period_targets ?? {}) };
              pt[period] = { ...(pt[period] ?? { target_value: null, target_binary: null }), ...updates };
              change({ period_targets: pt });
            };

            return (
              <TableRow
                key={kpi.id}
                className={cn(
                  "align-top",
                  isSelected && "bg-destructive/10 hover:bg-destructive/15",
                  isEditMode  && "bg-muted/20",
                )}
              >
                {/* Checkbox */}
                {isDeleteMode && (
                  <TableCell className="px-3 pt-2.5">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(kpi.id)}
                    />
                  </TableCell>
                )}

                {/* Title */}
                <TableCell className="font-medium align-top">
                  {isEditMode ? (
                    <Input
                      value={row.title}
                      onChange={(e) => change({ title: e.target.value })}
                      className="h-7 text-xs w-full"
                    />
                  ) : (
                    <span className="block break-words whitespace-normal">{kpi.title}</span>
                  )}
                </TableCell>

                {/* Description */}
                <TableCell className="text-xs text-muted-foreground align-top">
                  {isEditMode ? (
                    <Input
                      value={row.description ?? ""}
                      onChange={(e) => change({ description: e.target.value || null })}
                      className="h-7 text-xs w-full"
                    />
                  ) : (
                    <span className="block break-words whitespace-normal">{kpi.description ?? "—"}</span>
                  )}
                </TableCell>

                {/* Type */}
                <TableCell className="align-top">
                  {isEditMode ? (
                    <Select
                      value={row.kpi_type}
                      onValueChange={(v) => change({ kpi_type: v as KpiCardData["kpi_type"] })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="progressive">Progressive</SelectItem>
                        <SelectItem value="binary">Binary</SelectItem>
                        <SelectItem value="benchmark">Benchmark</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="outline" className={cn("border-0 text-xs font-medium", tb.className)}>
                        {tb.label}
                      </Badge>
                      {tb.scoringLabel && (
                        <span className="text-[10px] text-muted-foreground leading-tight">{tb.scoringLabel}</span>
                      )}
                    </div>
                  )}
                </TableCell>

                {/* Driver */}
                <TableCell className="align-top">
                  {isEditMode ? (
                    <Select
                      value={row.driver}
                      onValueChange={(v) => change({ driver: v as KpiCardData["driver"] })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="efficiency">Efficiency</SelectItem>
                        <SelectItem value="culture">Culture</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={cn("border-0 text-xs font-medium", ds.bg, ds.text)}>
                      {ds.label}
                    </Badge>
                  )}
                </TableCell>

                {/* Link column — label and content vary by variant */}
                <TableCell className="text-xs align-top">
                  {variant === "department" && isEditMode ? (
                    <Select
                      value={row.corp_kpi_id ?? "__none__"}
                      onValueChange={(v) => change({ corp_kpi_id: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {(corpKpisForLink ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : variant === "corporate" ? (
                    kpi.linked_dept_kpi_titles?.length ? (
                      <div className="flex flex-col gap-0.5">
                        {kpi.linked_dept_kpi_titles.map((t, i) => (
                          <span key={i} className="block break-words whitespace-normal font-medium text-foreground">
                            ↗ {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : variant === "department" ? (
                    kpi.corp_kpi_title ? (
                      <span className="block break-words whitespace-normal font-medium text-foreground">
                        ↗ {kpi.corp_kpi_title}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : kpi.linked_dept_kpi_titles?.length ? (
                    <div className="flex flex-col gap-0.5">
                      {kpi.linked_dept_kpi_titles.map((t, i) => (
                        <span key={i} className="block break-words whitespace-normal font-medium text-foreground">
                          ↗ {t}
                        </span>
                      ))}
                    </div>
                  ) : kpi.corp_kpi_title ? (
                    <span className="block break-words whitespace-normal font-medium text-foreground">
                      ↗ {kpi.corp_kpi_title}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Unit */}
                <TableCell className="text-xs text-muted-foreground align-top">
                  {isEditMode ? (
                    UNIT_OPTS.includes((row.unit ?? "") as typeof UNIT_OPTS[number]) ? (
                      <Select
                        value={row.unit ?? "_none_"}
                        onValueChange={(v) => change({ unit: v === "_none_" ? null : v })}
                      >
                        <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">—</SelectItem>
                          <SelectItem value="%">%</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="EUR M">EUR M</SelectItem>
                          <SelectItem value="Count">Count</SelectItem>
                          <SelectItem value="Score">Score</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={row.unit ?? ""}
                        onChange={(e) => change({ unit: e.target.value || null })}
                        className="h-7 text-xs w-full"
                        placeholder="—"
                      />
                    )
                  ) : (kpi.unit ?? "—")}
                </TableCell>

                {/* Period targets */}
                {showTargets && PERIODS.map((p) => (
                  <TableCell key={p} className="text-right text-xs tabular-nums align-top">
                    {isEditMode ? (
                      (() => {
                        if (isBinary) {
                          if (!BINARY_EDITABLE.has(p as Period)) {
                            return <span className="text-muted-foreground">—</span>;
                          }
                          const val = row.period_targets?.[p]?.target_binary;
                          return (
                            <Select
                              value={val === true ? "true" : val === false ? "false" : "null"}
                              onValueChange={(v) => changePeriod(p, { target_binary: v === "null" ? null : v === "true" })}
                            >
                              <SelectTrigger className="h-7 w-full text-xs px-1 ml-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">✓</SelectItem>
                                <SelectItem value="false">✗</SelectItem>
                                <SelectItem value="null">—</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        }
                        if (isDerivedPeriod(p as Period, row.period_agg_type ?? null)) {
                          const derived = deriveSinglePeriod(row.period_targets ?? {}, p as "h1" | "h2" | "fullyear", row.period_agg_type ?? null);
                          return (
                            <span className="text-xs tabular-nums text-muted-foreground italic">
                              {derived !== null ? derived : "—"}
                            </span>
                          );
                        }
                        return (
                          <Input
                            type="number"
                            value={row.period_targets?.[p]?.target_value ?? ""}
                            onChange={(e) =>
                              changePeriod(p, {
                                target_value: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className="h-7 w-full text-xs text-right"
                          />
                        );
                      })()
                    ) : periodCell(kpi, p)}
                  </TableCell>
                ))}

                {/* Actions */}
                {showActions && (
                  <TableCell className="text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && (
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(kpi)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          type="button" size="icon" variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDelete(kpi)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
