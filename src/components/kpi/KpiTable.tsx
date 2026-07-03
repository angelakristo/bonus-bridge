import { useRef, useState, useCallback, useEffect } from "react";
import { ArrowUpRight, Pencil, Trash2, Loader2 } from "lucide-react";

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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { KpiCardData } from "@/components/kpi/KpiCard";
import type { PeriodAggType, ScoringType, InputMode } from "@/lib/kpi-engine";
import {
  deriveSinglePeriod,
  isDerivedPeriod,
  PERIOD_AGG_META,
  SCORING_TYPE_META,
  INPUT_MODE_META,
  DERIVED_PERIODS as ENGINE_DERIVED_PERIODS,
} from "@/lib/kpi-engine";

export type KpiTableVariant = "library" | "corporate" | "department" | "individual";

type Props = {
  kpis: KpiCardData[];
  variant: KpiTableVariant;
  loading?: boolean;
  onEdit?: (kpi: KpiCardData) => void;
  onDelete?: (kpi: KpiCardData) => void;
  isEditMode?: boolean;
  editingRows?: Record<string, KpiCardData>;
  onRowChange?: (rowKey: string, updated: KpiCardData) => void;
  isDeleteMode?: boolean;
  selectedForDelete?: Set<string>;
  onToggleSelect?: (rowKey: string) => void;
  corpKpisForLink?: { id: string; title: string }[];
  getWeight?: (boardKpiId: string) => number;
  setWeight?: (boardKpiId: string, n: number) => void;
  subtotal?: number;
  onNavigateToKpi?: (rowKey: string, targetVariant: KpiTableVariant) => void;
  scrollTarget?: string | null;
  onScrollHandled?: () => void;
};


const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", label: "Growth"     },
  efficiency: { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-800 dark:text-blue-300",   label: "Efficiency" },
  culture:    { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", label: "Culture"    },
};

const LEGACY_AGG_LABEL: Record<string, string> = {
  progressive: "Progressive",
  binary:      "Binary",
  benchmark:   "Benchmark",
};

const SCORING_SHORT: Record<ScoringType, string> = {
  higher_is_better: "Higher",
  lower_is_better:  "Lower",
  target_range:     "Range",
  threshold_tiered: "Tiered",
  binary:           "Binary",
};

const INPUT_SHORT: Record<InputMode, string> = {
  periodic:            "Periodic",
  cumulative_to_date:  "Cumulative",
  period_end_snapshot: "Snapshot",
  component_based:     "Component",
  manual_aggregate:    "Manual",
};


const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

const BINARY_EDITABLE = new Set<Period>(["h1", "fullyear"]);

const UNIT_OPTS = ["", "%", "EUR", "EUR M", "Count", "Score"] as const;


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


function WeightInput({
  value, onChange, ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <Input
        type="number" min={0} max={100} step={1}
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)));
        }}
        className="h-7 w-16 text-right text-xs"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function SubtotalLabel({ sum }: { sum: number }) {
  const color = sum === 100 ? "text-green-600" : sum > 100 ? "text-destructive" : "text-muted-foreground";
  return <span className={cn("text-sm font-medium", color)}>{sum}% of 100%</span>;
}


function RelatedKpiBadge({
  title, isDependent, onClick,
}: {
  title: string;
  isDependent?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-0.5 text-left group",
        onClick ? "cursor-pointer hover:underline" : "cursor-default",
        "text-blue-600 dark:text-blue-400 text-[11px] leading-tight",
      )}
    >
      {!isDependent && <ArrowUpRight className="h-3 w-3 flex-shrink-0" />}
      <span className="break-words whitespace-normal">{title}</span>
      {isDependent && <ArrowUpRight className="h-3 w-3 flex-shrink-0" />}
    </button>
  );

  if (!onClick) return inner;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Click to navigate to this KPI</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


function inferPrecedentVariant(v: KpiTableVariant): KpiTableVariant {
  if (v === "corporate")  return "department";
  if (v === "department") return "individual";
  return "department"; 
}

function inferDependentVariant(v: KpiTableVariant): KpiTableVariant {
  if (v === "department") return "corporate";
  if (v === "individual") return "department";
  return "corporate"; 
}


export function KpiTable({
  kpis, variant, loading,
  onEdit, onDelete,
  isEditMode, editingRows, onRowChange,
  isDeleteMode, selectedForDelete, onToggleSelect,
  corpKpisForLink,
  getWeight, setWeight, subtotal,
  onNavigateToKpi, scrollTarget, onScrollHandled,
}: Props) {
  const showActions = variant !== "library" && (!!onEdit || !!onDelete) && !isEditMode && !isDeleteMode;
  const showWeight  = !!getWeight && !!setWeight;

  const totalCols =
    (isDeleteMode ? 1 : 0) +
    15 +   
    (showWeight  ? 1 : 0) +
    (showActions ? 1 : 0);

  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);

  const scrollToRow = useCallback((rowKey: string, targetVariant: KpiTableVariant) => {
    const el = rowRefs.current[rowKey];
    if (!el) {
      onNavigateToKpi?.(rowKey, targetVariant);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedRow(rowKey);
    setTimeout(() => setHighlightedRow(null), 1500);
  }, [onNavigateToKpi]);

  useEffect(() => {
    if (!scrollTarget) return;
    const el = rowRefs.current[scrollTarget];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedRow(scrollTarget);
      setTimeout(() => setHighlightedRow(null), 1500);
    }
    onScrollHandled?.();
  }, [scrollTarget]);

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
          : showWeight
            ? "No KPIs assigned in this group."
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
            <TableHead className="w-24">Period Agg</TableHead>
            <TableHead className="w-24">Scoring</TableHead>
            <TableHead className="w-22">Input</TableHead>
            <TableHead className="w-36">Related KPIs</TableHead>
            <TableHead className="w-28">Driver</TableHead>
            <TableHead className="w-20">Unit</TableHead>
            {PERIODS.map((p) => (
              <TableHead key={p} className="w-14 text-right">
                {PERIOD_LABEL[p]}
                {isEditMode && !ENGINE_DERIVED_PERIODS.has(p) && (
                  <span className="ml-0.5 text-[9px] text-blue-500">✎</span>
                )}
              </TableHead>
            ))}
            {showWeight  && <TableHead className="w-28 text-right">Weight %</TableHead>}
            {showActions && <TableHead className="w-16 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {kpis.map((kpi) => {
            const rowKey    = kpi.board_kpi_id ?? kpi.id;
            const row: KpiCardData = (isEditMode ? editingRows?.[rowKey] : undefined) ?? kpi;
            const isSelected = !!(isDeleteMode && selectedForDelete?.has(rowKey));
            const isHighlighted = highlightedRow === rowKey;
            const ds = DRIVER_STYLE[row.driver] ?? DRIVER_STYLE.growth;
            const isBinary = isBinaryKpi(row);

            const change = (updates: Partial<KpiCardData>) =>
              onRowChange?.(rowKey, { ...row, ...updates } as KpiCardData);

            const changePeriod = (
              period: Period,
              updates: Partial<{ target_value: number | null; target_binary: boolean | null }>,
            ) => {
              const pt = { ...(row.period_targets ?? {}) };
              pt[period] = { ...(pt[period] ?? { target_value: null, target_binary: null }), ...updates };
              change({ period_targets: pt });
            };

            const precedents: { rowKey: string | null; title: string }[] =
              kpi.precedent_kpi_titles?.length
                ? kpi.precedent_kpi_titles.map((title, i) => ({
                    rowKey: kpi.precedent_kpi_ids?.[i] ?? null,
                    title,
                  }))
                : variant === "corporate" || variant === "library"
                  ? (kpi.linked_dept_kpi_titles ?? []).map((title) => ({ rowKey: null, title }))
                  : [];

            const dependent: { rowKey: string | null; title: string } | null =
              kpi.dependent_kpi_title
                ? { rowKey: kpi.dependent_kpi_id ?? null, title: kpi.dependent_kpi_title }
                : (variant === "department" || variant === "library") && kpi.corp_kpi_title
                  ? { rowKey: kpi.corp_kpi_id ?? null, title: kpi.corp_kpi_title }
                  : variant === "individual" || variant === "library"
                    ? (() => {
                        const m = (kpi.description ?? "").match(/^Aligns to dept KPI: (.+?)\./);
                        return m ? { rowKey: null, title: m[1] } : null;
                      })()
                    : null;

            const hasRelated = precedents.length > 0 || dependent !== null;

            return (
              <TableRow
                key={rowKey}
                ref={(el) => { rowRefs.current[rowKey] = el; }}
                className={cn(
                  "align-top",
                  isSelected    && "bg-destructive/10 hover:bg-destructive/15",
                  isEditMode    && "bg-muted/20",
                  isHighlighted && "bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-400",
                )}
              >
                {}
                {isDeleteMode && (
                  <TableCell className="px-3 pt-2.5">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(rowKey)}
                    />
                  </TableCell>
                )}

                {}
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

                {}
                <TableCell className="text-xs text-muted-foreground align-top">
                  {isEditMode ? (
                    <Input
                      value={row.description ?? ""}
                      onChange={(e) => change({ description: e.target.value || null })}
                      className="h-7 text-xs w-full"
                    />
                  ) : (
                    <span className="block break-words whitespace-normal">
                      {variant === "individual"
                        ? (() => {
                            const m = (kpi.description ?? "").match(/^Aligns to dept KPI: .+?\.\s*/);
                            return m ? kpi.description!.slice(m[0].length) || "—" : (kpi.description ?? "—");
                          })()
                        : (kpi.description ?? "—")}
                    </span>
                  )}
                </TableCell>

                {}
                <TableCell className="align-top">
                  {isEditMode ? (
                    <Select
                      value={row.period_agg_type ?? "additive_flow"}
                      onValueChange={(v) => change({ period_agg_type: v as PeriodAggType })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PERIOD_AGG_META) as PeriodAggType[]).map((k) => (
                          <SelectItem key={k} value={k}>{PERIOD_AGG_META[k].shortLabel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-0 text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                    >
                      {row.period_agg_type
                        ? PERIOD_AGG_META[row.period_agg_type].shortLabel
                        : (LEGACY_AGG_LABEL[row.kpi_type] ?? "—")}
                    </Badge>
                  )}
                </TableCell>

                {}
                <TableCell className="align-top">
                  {isEditMode ? (
                    <Select
                      value={row.scoring_type ?? "higher_is_better"}
                      onValueChange={(v) => change({ scoring_type: v as ScoringType })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SCORING_TYPE_META) as ScoringType[]).map((k) => (
                          <SelectItem key={k} value={k}>{SCORING_TYPE_META[k].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {row.scoring_type ? SCORING_SHORT[row.scoring_type] : "—"}
                    </span>
                  )}
                </TableCell>

                {}
                <TableCell className="align-top">
                  {isEditMode ? (
                    <Select
                      value={row.input_mode ?? "periodic"}
                      onValueChange={(v) => change({ input_mode: v as InputMode })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(INPUT_MODE_META) as InputMode[]).map((k) => (
                          <SelectItem key={k} value={k}>{INPUT_MODE_META[k].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {row.input_mode ? INPUT_SHORT[row.input_mode] : "—"}
                    </span>
                  )}
                </TableCell>

                {}
                <TableCell className="align-top">
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
                  ) : hasRelated ? (
                    <div className="flex flex-col gap-1">
                      {precedents.map((p, i) => (
                        <RelatedKpiBadge
                          key={i}
                          title={p.title}
                          isDependent={false}
                          onClick={p.rowKey ? () => scrollToRow(p.rowKey!, inferPrecedentVariant(variant)) : undefined}
                        />
                      ))}
                      {dependent && (
                        <RelatedKpiBadge
                          title={dependent.title}
                          isDependent={true}
                          onClick={dependent.rowKey ? () => scrollToRow(dependent.rowKey!, inferDependentVariant(variant)) : undefined}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>

                {}
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

                {}
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

                {}
                {PERIODS.map((p) => (
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

                {}
                {showWeight && (
                  <TableCell className="align-top text-right">
                    <WeightInput
                      ariaLabel={`Weight for ${kpi.title}`}
                      value={getWeight!(rowKey)}
                      onChange={(n) => setWeight!(rowKey, n)}
                    />
                  </TableCell>
                )}

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

        {/* Subtotal footer — only when weight column is present */}
        {showWeight && subtotal !== undefined && (
          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={totalCols - 1}
                className="text-xs text-muted-foreground uppercase tracking-wide py-2"
              >
                Subtotal
              </TableCell>
              <TableCell className="text-right py-2">
                <SubtotalLabel sum={subtotal} />
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
