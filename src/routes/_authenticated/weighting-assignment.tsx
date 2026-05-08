import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import type { KpiCardData } from "@/components/kpi/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/weighting-assignment")({
  component: WeightingAssignmentPage,
});

/* ── Types ──────────────────────────────────────────────────────────────────── */

type KpiLevel   = "corporate" | "department" | "individual";
type KpiType    = "progressive" | "binary" | "benchmark";
type KpiDriver  = "growth" | "efficiency" | "culture";

/** KpiCardData extended with the dept-KPI reference extracted from the description prefix. */
type WeightKpiRow = KpiCardData & { dept_kpi_ref?: string | null };

type QuarterPeriod      = "q1" | "q2" | "q3" | "q4";
type BinaryTargetPeriod = "h1" | "fullyear";

type DeptKpiOption = { id: string; title: string };

/* ── Table constants (mirror KpiTable) ──────────────────────────────────────── */

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-800 dark:text-green-300",  label: "Growth"     },
  efficiency: { bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-800 dark:text-blue-300",    label: "Efficiency" },
  culture:    { bg: "bg-amber-100 dark:bg-amber-900/30",  text: "text-amber-800 dark:text-amber-300",  label: "Culture"    },
};

const TYPE_STYLE: Record<string, { label: string; className: string }> = {
  progressive: { label: "Progressive", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300" },
  binary:      { label: "Binary",      className: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"             },
  benchmark:   { label: "Benchmark",   className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
};

const GROUP_COLORS = [
  { key: "corporate",  label: "Corporate",  bar: "bg-blue-500",    dot: "bg-blue-500"    },
  { key: "department", label: "Department", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "individual", label: "Individual", bar: "bg-violet-500",  dot: "bg-violet-500"  },
];

const UNIT_PRESETS = [
  { value: "%",      label: "% (Percentage)" },
  { value: "EUR",    label: "EUR (Euros)"     },
  { value: "Count",  label: "Count"           },
  { value: "score",  label: "Score out of…"  },
  { value: "custom", label: "Custom…"         },
];

const QUARTER_FIELDS: { key: QuarterPeriod; label: string }[] = [
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" },
];

const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

const DERIVED_PERIODS = new Set<Period>(["h1", "h2", "fullyear"]);
const BINARY_EDITABLE  = new Set<Period>(["h1", "fullyear"]);

const LINK_COL_LABEL: Record<"corporate" | "department" | "individual", string> = {
  corporate:  "Department KPI",
  department: "Corporate KPI",
  individual: "Dept KPI Ref",
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function deriveUnit(preset: string, custom: string, scoreOf: string): string | null {
  if (preset === "score") { const n = scoreOf.trim(); return n ? `Score out of ${n}` : "Score"; }
  if (preset === "custom") return custom.trim() || null;
  return preset || null;
}

function reverseUnit(unit: string | null): { unitPreset: string; unitCustom: string; unitScoreOf: string } {
  if (!unit) return { unitPreset: "", unitCustom: "", unitScoreOf: "" };
  if (unit === "%" || unit === "EUR" || unit === "Count")
    return { unitPreset: unit, unitCustom: "", unitScoreOf: "" };
  const m = unit.match(/^Score out of (\d+)$/);
  if (m) return { unitPreset: "score", unitCustom: "", unitScoreOf: m[1] };
  return { unitPreset: "custom", unitCustom: unit, unitScoreOf: "" };
}

/** Splits the description into a dept-KPI reference title and the clean remainder. */
function extractDeptRef(desc: string | null): { deptRef: string | null; cleanDesc: string | null } {
  if (!desc) return { deptRef: null, cleanDesc: null };
  const m = desc.match(/^Aligns to dept KPI: (.+?)\.\s*/);
  if (m) return { deptRef: m[1], cleanDesc: desc.slice(m[0].length) || null };
  return { deptRef: null, cleanDesc: desc };
}

function periodCell(kpi: KpiCardData, period: Period): string {
  const t = kpi.period_targets?.[period];
  if (kpi.kpi_type === "binary") {
    if (!BINARY_EDITABLE.has(period)) return "—";
    if (!t) return "—";
    return t.target_binary === true ? "✓" : t.target_binary === false ? "✗" : "—";
  }
  if (!t || t.target_value === null) return "—";
  return String(t.target_value);
}

function computeDerived(
  pt: Record<string, { target_value: number | null; target_binary: boolean | null }> | undefined,
  p: "h1" | "h2" | "fullyear",
): number | null {
  const q1 = pt?.["q1"]?.target_value ?? null;
  const q2 = pt?.["q2"]?.target_value ?? null;
  const q3 = pt?.["q3"]?.target_value ?? null;
  const q4 = pt?.["q4"]?.target_value ?? null;
  const h1 = q1 !== null && q2 !== null ? q1 + q2 : null;
  const h2 = q3 !== null && q4 !== null ? q3 + q4 : null;
  if (p === "h1") return h1;
  if (p === "h2") return h2;
  return h1 !== null && h2 !== null ? h1 + h2 : null;
}

/* ── AllocationBar ───────────────────────────────────────────────────────────── */

type BarSegment = { key: string; pct: number; bar: string; label: string };

function AllocationBar({ segments, empty }: { segments: BarSegment[]; empty?: boolean }) {
  if (empty || segments.every((s) => s.pct === 0)) {
    return <div className="h-5 w-full rounded-full bg-muted" />;
  }
  return (
    <div className="flex h-5 w-full overflow-hidden rounded-full">
      {segments.map((s) =>
        s.pct === 0 ? null : (
          <div
            key={s.key}
            className={cn("flex items-center justify-center text-[10px] font-semibold text-white", s.bar)}
            style={{ width: `${s.pct}%` }}
          >
            {s.pct >= 14 ? `${s.pct}%` : ""}
          </div>
        ),
      )}
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────────────────────────────── */

function WeightInput({
  value, onChange, ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number" min={0} max={100} step={1}
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(clampPct(parseInt(e.target.value, 10)))}
        className="h-8 w-20 text-right text-xs"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function SubtotalLabel({ sum }: { sum: number }) {
  const color = sum === 100 ? "text-green-600" : sum > 100 ? "text-destructive" : "text-muted-foreground";
  return <span className={cn("text-sm font-medium", color)}>{sum}% of 100%</span>;
}

/* ── WeightKpiTable ─────────────────────────────────────────────────────────── */

function WeightKpiTable({
  kpis, variant, loading,
  getWeight, setWeight,
  isEditMode, editingRows, onRowChange,
  isDeleteMode, selectedForDelete, onToggleSelect,
}: {
  kpis: WeightKpiRow[];
  variant: "corporate" | "department" | "individual";
  loading?: boolean;
  getWeight: (boardKpiId: string) => number;
  setWeight: (boardKpiId: string, n: number) => void;
  isEditMode?: boolean;
  editingRows?: Record<string, WeightKpiRow>;
  onRowChange?: (boardKpiId: string, updater: (row: WeightKpiRow) => WeightKpiRow) => void;
  isDeleteMode?: boolean;
  selectedForDelete?: Set<string>;
  onToggleSelect?: (boardKpiId: string) => void;
}) {
  const subtotal = kpis.reduce((acc, r) => acc + getWeight(r.board_kpi_id ?? ""), 0);
  // title+desc+type+driver+link+unit + 7 periods + weight = 14; +1 checkbox col when deleting
  const totalCols = 14 + (isDeleteMode ? 1 : 0);

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
        No KPIs assigned in this group.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed w-full">
        <colgroup>
          {isDeleteMode && <col style={{ width: "36px" }} />}
          <col style={{ width: "13%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "5%" }} />
          {PERIODS.map((p) => <col key={p} style={{ width: "4%" }} />)}
          <col style={{ width: "10%" }} />
        </colgroup>
        <TableHeader>
          <TableRow>
            {isDeleteMode && <TableHead />}
            <TableHead>Title</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>{LINK_COL_LABEL[variant]}</TableHead>
            <TableHead>Unit</TableHead>
            {PERIODS.map((p) => (
              <TableHead key={p} className="text-right">{PERIOD_LABEL[p]}</TableHead>
            ))}
            <TableHead className="text-right">Weight %</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {kpis.map((kpi) => {
            const boardId  = kpi.board_kpi_id ?? "";
            const editRow  = (isEditMode && variant === "individual") ? (editingRows?.[boardId] ?? kpi) : kpi;
            const ds       = DRIVER_STYLE[editRow.driver]   ?? DRIVER_STYLE.growth;
            const ts       = TYPE_STYLE[editRow.kpi_type]   ?? TYPE_STYLE.progressive;
            const isSelected = isDeleteMode && selectedForDelete?.has(boardId);

            return (
              <TableRow key={kpi.id} className={cn("align-top", isSelected && "bg-destructive/5")}>

                {/* Checkbox (delete mode) */}
                {isDeleteMode && (
                  <TableCell className="align-middle pt-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(boardId)}
                    />
                  </TableCell>
                )}

                {/* Title */}
                <TableCell className="font-medium align-top">
                  {isEditMode && variant === "individual" ? (
                    <Input
                      value={editRow.title}
                      onChange={(e) => onRowChange?.(boardId, (row) => ({ ...row, title: e.target.value }))}
                      className="h-7 text-xs w-full"
                    />
                  ) : (
                    <span className="block break-words whitespace-normal text-sm">{kpi.title}</span>
                  )}
                </TableCell>

                {/* Description */}
                <TableCell className="text-xs text-muted-foreground align-top">
                  {isEditMode && variant === "individual" ? (
                    <Input
                      value={extractDeptRef(editRow.description ?? null).cleanDesc ?? ""}
                      onChange={(e) => {
                        const { deptRef } = extractDeptRef(editRow.description ?? null);
                        const prefix = deptRef ? `Aligns to dept KPI: ${deptRef}. ` : "";
                        const next   = e.target.value ? prefix + e.target.value : (deptRef ? prefix.trimEnd() : null);
                        onRowChange?.(boardId, (row) => ({ ...row, description: next }));
                      }}
                      className="h-7 text-xs w-full"
                    />
                  ) : (
                    <span className="block break-words whitespace-normal">
                      {variant === "individual"
                        ? (extractDeptRef(kpi.description ?? null).cleanDesc ?? "—")
                        : (kpi.description ?? "—")}
                    </span>
                  )}
                </TableCell>

                {/* Type */}
                <TableCell className="align-top">
                  {isEditMode && variant === "individual" ? (
                    <Select
                      value={editRow.kpi_type}
                      onValueChange={(v) => onRowChange?.(boardId, (row) => ({ ...row, kpi_type: v as KpiType }))}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="progressive">Progressive</SelectItem>
                        <SelectItem value="binary">Binary</SelectItem>
                        <SelectItem value="benchmark">Benchmark</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={cn("border-0 text-xs font-medium", ts.className)}>
                      {ts.label}
                    </Badge>
                  )}
                </TableCell>

                {/* Driver */}
                <TableCell className="align-top">
                  {isEditMode && variant === "individual" ? (
                    <Select
                      value={editRow.driver}
                      onValueChange={(v) => onRowChange?.(boardId, (row) => ({ ...row, driver: v as KpiDriver }))}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
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

                {/* Link column — always read-only */}
                <TableCell className="text-xs align-top">
                  {variant === "corporate" && (
                    kpi.linked_dept_kpi_titles?.length ? (
                      <div className="flex flex-col gap-0.5">
                        {kpi.linked_dept_kpi_titles.map((t, i) => (
                          <span key={i} className="block break-words whitespace-normal font-medium text-foreground">↗ {t}</span>
                        ))}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>
                  )}
                  {variant === "department" && (
                    kpi.corp_kpi_title
                      ? <span className="block break-words whitespace-normal font-medium text-foreground">↗ {kpi.corp_kpi_title}</span>
                      : <span className="text-muted-foreground">—</span>
                  )}
                  {variant === "individual" && (
                    kpi.dept_kpi_ref
                      ? <span className="block break-words whitespace-normal font-medium text-foreground">↗ {kpi.dept_kpi_ref}</span>
                      : <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Unit */}
                <TableCell className="text-xs text-muted-foreground align-top">
                  {isEditMode && variant === "individual" ? (
                    <Input
                      value={editRow.unit ?? ""}
                      onChange={(e) => onRowChange?.(boardId, (row) => ({ ...row, unit: e.target.value || null }))}
                      className="h-7 text-xs w-16"
                    />
                  ) : (
                    kpi.unit ?? "—"
                  )}
                </TableCell>

                {/* Period targets */}
                {PERIODS.map((p) => {
                  if (isEditMode && variant === "individual") {
                    const isBinary = editRow.kpi_type === "binary";
                    const isDerived = DERIVED_PERIODS.has(p);

                    if (isBinary) {
                      if (BINARY_EDITABLE.has(p)) {
                        return (
                          <TableCell key={p} className="text-right align-middle pt-3">
                            <Checkbox
                              checked={editRow.period_targets?.[p]?.target_binary ?? false}
                              onCheckedChange={(checked) =>
                                onRowChange?.(boardId, (row) => ({
                                  ...row,
                                  period_targets: {
                                    ...row.period_targets,
                                    [p]: { target_value: null, target_binary: !!checked },
                                  },
                                }))
                              }
                            />
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={p} className="text-right text-xs text-muted-foreground align-top">—</TableCell>
                      );
                    }

                    if (isDerived) {
                      const derived = computeDerived(editRow.period_targets, p as "h1" | "h2" | "fullyear");
                      return (
                        <TableCell key={p} className="text-right align-top">
                          <span className="text-xs italic text-muted-foreground">
                            {derived !== null ? String(derived) : "—"}
                          </span>
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell key={p} className="text-right align-top">
                        <Input
                          type="number"
                          value={editRow.period_targets?.[p]?.target_value ?? ""}
                          onChange={(e) => {
                            const val = parseNum(e.target.value);
                            onRowChange?.(boardId, (row) => ({
                              ...row,
                              period_targets: {
                                ...row.period_targets,
                                [p]: { target_value: val, target_binary: null },
                              },
                            }));
                          }}
                          className="h-7 w-full text-xs text-right"
                        />
                      </TableCell>
                    );
                  }

                  // Read-only mode
                  return (
                    <TableCell key={p} className="text-right text-xs tabular-nums align-top">
                      {DERIVED_PERIODS.has(p) ? (
                        <span className="italic text-muted-foreground">
                          {kpi.kpi_type === "binary"
                            ? (BINARY_EDITABLE.has(p) ? periodCell(kpi, p) : "—")
                            : (() => {
                                const v = computeDerived(kpi.period_targets, p as "h1" | "h2" | "fullyear");
                                return v !== null ? String(v) : "—";
                              })()}
                        </span>
                      ) : (
                        periodCell(kpi, p)
                      )}
                    </TableCell>
                  );
                })}

                {/* Weight % — always editable */}
                <TableCell className="align-top text-right">
                  <div className="flex justify-end">
                    <WeightInput
                      ariaLabel={`Weight for ${kpi.title}`}
                      value={getWeight(boardId)}
                      onChange={(n) => setWeight(boardId, n)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>

        {/* Subtotal footer */}
        <TableFooter>
          <TableRow>
            <TableCell colSpan={totalCols - 1} className="text-xs text-muted-foreground uppercase tracking-wide py-2">
              Subtotal
            </TableCell>
            <TableCell className="text-right py-2">
              <SubtotalLabel sum={subtotal} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/* ── AddIndividualKpiModal ──────────────────────────────────────────────────── */

type IndKpiForm = {
  title: string;
  description: string;
  kpi_type: KpiType;
  driver: KpiDriver;
  unitPreset: string;
  unitCustom: string;
  unitScoreOf: string;
  quarter_targets: Record<QuarterPeriod, string>;
  binary_targets: Record<BinaryTargetPeriod, boolean>;
};

const IND_EMPTY: IndKpiForm = {
  title: "", description: "", kpi_type: "progressive", driver: "growth",
  unitPreset: "", unitCustom: "", unitScoreOf: "",
  quarter_targets: { q1: "", q2: "", q3: "", q4: "" },
  binary_targets: { h1: false, fullyear: false },
};

function AddIndividualKpiModal({
  open, onOpenChange,
  personId, entityId, year,
  onSuccess,
  editKpiDefId,
  editIndKpiId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  entityId: string;
  year: number;
  onSuccess: () => void;
  editKpiDefId?: string;
  editIndKpiId?: string;
}) {
  const { person } = useAuth();
  const isEditMode = !!editKpiDefId;

  const [values, setValues]                         = useState<IndKpiForm>(IND_EMPTY);
  const [titleError, setTitleError]                 = useState<string | null>(null);
  const [saving, setSaving]                         = useState(false);
  const [deptKpis, setDeptKpis]                     = useState<DeptKpiOption[]>([]);
  const [deptKpisLoading, setDeptKpisLoading]       = useState(false);
  const [selectedDeptKpiId, setSelectedDeptKpiId]   = useState<string>("__none__");

  /* Load dept KPIs for the employee's org departments */
  useEffect(() => {
    if (!open || !personId || !entityId) return;
    let cancelled = false;
    setDeptKpisLoading(true);
    void (async () => {
      const { data: depts } = await supabase
        .from("people_org_departments").select("org_department_id").eq("person_id", personId);
      const orgDeptIds = (depts ?? []).map((d) => d.org_department_id);
      if (orgDeptIds.length === 0) {
        if (!cancelled) { setDeptKpis([]); setDeptKpisLoading(false); }
        return;
      }
      const { data: dkpis } = await supabase
        .from("department_kpis").select("id, kpi_definitions(title)")
        .eq("entity_id", entityId).eq("year", year).in("org_department_id", orgDeptIds);
      if (!cancelled) {
        setDeptKpis(
          (dkpis ?? []).map((r) => ({
            id: r.id,
            title: (r.kpi_definitions as unknown as { title: string } | null)?.title ?? "Untitled",
          })),
        );
        setDeptKpisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, personId, entityId, year]);

  /* Pre-populate in edit mode */
  useEffect(() => {
    if (!open || !editKpiDefId) return;
    void (async () => {
      const { data: def } = await supabase
        .from("kpi_definitions").select("title, description, kpi_type, driver, unit")
        .eq("id", editKpiDefId).single();
      if (!def) return;

      const { deptRef, cleanDesc } = extractDeptRef(def.description ?? null);
      const unitFields = reverseUnit(def.unit);
      let qt: Record<QuarterPeriod, string> = { q1: "", q2: "", q3: "", q4: "" };
      let bt: Record<BinaryTargetPeriod, boolean> = { h1: false, fullyear: false };

      if (editIndKpiId) {
        const { data: tgts } = await supabase
          .from("individual_kpi_targets").select("period, target_value, target_binary")
          .eq("individual_kpi_id", editIndKpiId);
        for (const t of tgts ?? []) {
          if (["q1", "q2", "q3", "q4"].includes(t.period))
            qt[t.period as QuarterPeriod] = t.target_value != null ? String(t.target_value) : "";
          if (t.period === "h1")       bt.h1       = t.target_binary ?? false;
          if (t.period === "fullyear") bt.fullyear = t.target_binary ?? false;
        }
      }

      setValues({
        title: def.title,
        description: cleanDesc ?? "",
        kpi_type: def.kpi_type as KpiType,
        driver: def.driver as KpiDriver,
        ...unitFields,
        quarter_targets: qt,
        binary_targets: bt,
      });

      // Pre-select dept KPI reference by title match (best-effort)
      if (deptRef) {
        // deptKpis may not be loaded yet; match will work once they are
        const match = deptKpis.find((d) => d.title === deptRef);
        setSelectedDeptKpiId(match?.id ?? "__none__");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editKpiDefId, editIndKpiId]);

  /* Re-check dept KPI pre-selection once deptKpis are loaded (edit mode) */
  useEffect(() => {
    if (!isEditMode || !open || deptKpisLoading) return;
    if (selectedDeptKpiId !== "__none__") return; // already resolved
    // We need the description ref title — re-extract from values.description is insufficient
    // because we already stripped it. Instead store the raw ref from the open effect.
    // This is a best-effort — if the user's edit flow opens after deptKpis are ready,
    // the open effect above will find the match correctly.
  }, [deptKpis, deptKpisLoading, isEditMode, open, selectedDeptKpiId]);

  const update = <K extends keyof IndKpiForm>(key: K, val: IndKpiForm[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const q1 = parseNum(values.quarter_targets.q1);
  const q2 = parseNum(values.quarter_targets.q2);
  const q3 = parseNum(values.quarter_targets.q3);
  const q4 = parseNum(values.quarter_targets.q4);
  const h1Computed = q1 !== null && q2 !== null ? q1 + q2 : null;
  const h2Computed = q3 !== null && q4 !== null ? q3 + q4 : null;
  const fyComputed = h1Computed !== null && h2Computed !== null ? h1Computed + h2Computed : null;

  const buildNumericRows = (fk: string, fkVal: string) => {
    const rows: Record<string, unknown>[] = [];
    const qs: [QuarterPeriod, number | null][] = [["q1", q1], ["q2", q2], ["q3", q3], ["q4", q4]];
    for (const [p, v] of qs) if (v !== null) rows.push({ [fk]: fkVal, period: p, target_value: v });
    if (h1Computed !== null) rows.push({ [fk]: fkVal, period: "h1",       target_value: h1Computed });
    if (h2Computed !== null) rows.push({ [fk]: fkVal, period: "h2",       target_value: h2Computed });
    if (fyComputed  !== null) rows.push({ [fk]: fkVal, period: "fullyear", target_value: fyComputed  });
    return rows;
  };

  const buildBinaryRows = (fk: string, fkVal: string) => [
    { [fk]: fkVal, period: "h1",       target_binary: values.binary_targets.h1       },
    { [fk]: fkVal, period: "fullyear", target_binary: values.binary_targets.fullyear },
  ];

  const resetForm = () => {
    setValues(IND_EMPTY);
    setTitleError(null);
    setSelectedDeptKpiId("__none__");
    setDeptKpis([]);
  };

  const handleCancel = () => { if (saving) return; resetForm(); onOpenChange(false); };

  const handleSave = async () => {
    if (!values.title.trim()) { setTitleError("KPI Title is required."); return; }
    setTitleError(null);
    if (!person?.id) return toast.error("Cannot identify current user.");

    setSaving(true);
    try {
      const unit     = deriveUnit(values.unitPreset, values.unitCustom, values.unitScoreOf);
      const isBinary = values.kpi_type === "binary";

      /* Build description with optional dept KPI ref prefix */
      let description = values.description.trim() || null;
      if (selectedDeptKpiId !== "__none__") {
        const refTitle = deptKpis.find((d) => d.id === selectedDeptKpiId)?.title ?? "";
        const refNote  = `Aligns to dept KPI: ${refTitle}.`;
        description    = description ? `${refNote} ${description}` : refNote;
      }

      if (isEditMode && editKpiDefId && editIndKpiId) {
        /* ── Edit mode ── */
        const { error: defErr } = await supabase
          .from("kpi_definitions")
          .update({ title: values.title.trim(), description, kpi_type: values.kpi_type, driver: values.driver, unit })
          .eq("id", editKpiDefId);
        if (defErr) throw new Error(defErr.message);

        const targetRows = isBinary
          ? buildBinaryRows("individual_kpi_id", editIndKpiId)
          : buildNumericRows("individual_kpi_id", editIndKpiId);
        if (targetRows.length > 0) {
          const { error: tErr } = await supabase
            .from("individual_kpi_targets")
            .upsert(targetRows as never, { onConflict: "individual_kpi_id,period" });
          if (tErr) throw new Error(tErr.message);
        }

        toast.success("Individual KPI updated.");
      } else {
        /* ── Add mode ── */
        const { data: defData, error: defErr } = await supabase
          .from("kpi_definitions")
          .insert({ entity_id: entityId, title: values.title.trim(), description, kpi_type: values.kpi_type, driver: values.driver, unit, year, is_active: true, created_by: person.id })
          .select("id").single();
        if (defErr || !defData) throw new Error(defErr?.message ?? "Failed to create KPI definition.");

        const { count: existingCount } = await supabase
          .from("individual_kpis").select("id", { count: "exact", head: true })
          .eq("entity_id", entityId).eq("year", year).eq("person_id", personId);

        const { data: indData, error: indErr } = await supabase
          .from("individual_kpis")
          .insert({
            entity_id: entityId, person_id: personId, kpi_definition_id: defData.id,
            year, display_order: (existingCount ?? 0) + 1,
            status: "approved", proposed_by: person.id, approved_by: person.id, is_active: true,
          })
          .select("id").single();
        if (indErr || !indData) throw new Error(indErr?.message ?? "Failed to create individual KPI.");

        const targetRows = isBinary
          ? buildBinaryRows("individual_kpi_id", indData.id)
          : buildNumericRows("individual_kpi_id", indData.id);
        if (targetRows.length > 0) {
          const { error: tErr } = await supabase.from("individual_kpi_targets").insert(targetRows as never);
          if (tErr) throw new Error(tErr.message);
        }

        toast.success("Individual KPI assigned to employee.");
      }

      onSuccess();
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!saving) { if (!next) resetForm(); onOpenChange(next); } }}
    >
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Individual KPI" : "Add Individual KPI"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the KPI details and targets."
              : "Define the KPI for this employee. It will be assigned directly and immediately visible in their weighting profile."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Department KPI Reference */}
          <div className="space-y-1.5">
            <Label>Department KPI Reference</Label>
            <Select value={selectedDeptKpiId} onValueChange={setSelectedDeptKpiId} disabled={deptKpisLoading}>
              <SelectTrigger>
                <SelectValue placeholder={deptKpisLoading ? "Loading…" : "None (standalone KPI)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (standalone KPI)</SelectItem>
                {deptKpis.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which department KPI this individual KPI supports, if applicable.
            </p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-title">KPI Title <span className="text-destructive">*</span></Label>
            <Input
              id="ind-kpi-title" value={values.title}
              onChange={(e) => { update("title", e.target.value); if (titleError) setTitleError(null); }}
              placeholder="e.g. Personal Revenue Target"
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-desc">Description</Label>
            <Textarea
              id="ind-kpi-desc" value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional context about this KPI" rows={2}
            />
          </div>

          {/* KPI Type */}
          <div className="space-y-2">
            <Label>KPI Type</Label>
            <RadioGroup value={values.kpi_type} onValueChange={(v) => update("kpi_type", v as KpiType)} className="gap-2">
              {[
                { id: "ind-type-prog",  value: "progressive", label: "Progressive", sub: "Tracked cumulatively by value" },
                { id: "ind-type-bin",   value: "binary",      label: "Binary",      sub: "Achieved or not achieved"       },
                { id: "ind-type-bench", value: "benchmark",   label: "Benchmark",   sub: "Point-in-time score"            },
              ].map((t) => (
                <Label key={t.id} htmlFor={t.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
                >
                  <RadioGroupItem id={t.id} value={t.value} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.sub}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* Driver */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-driver">Driver</Label>
            <Select value={values.driver} onValueChange={(v) => update("driver", v as KpiDriver)}>
              <SelectTrigger id="ind-kpi-driver"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="culture">Culture</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-unit">Unit</Label>
            <Select
              value={values.unitPreset}
              onValueChange={(v) => { update("unitPreset", v); update("unitCustom", ""); update("unitScoreOf", ""); }}
            >
              <SelectTrigger id="ind-kpi-unit"><SelectValue placeholder="Select unit (optional)" /></SelectTrigger>
              <SelectContent>
                {UNIT_PRESETS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {values.unitPreset === "score" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Score out of</span>
                <Input type="number" min={1} placeholder="e.g. 5" value={values.unitScoreOf}
                  onChange={(e) => update("unitScoreOf", e.target.value)} className="w-24" />
              </div>
            )}
            {values.unitPreset === "custom" && (
              <Input placeholder="Enter unit label" value={values.unitCustom}
                onChange={(e) => update("unitCustom", e.target.value)} />
            )}
          </div>

          {/* Targets */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Targets</Label>
              <p className="text-xs text-muted-foreground">
                Enter quarterly targets — H1, H2, and Full Year are calculated automatically.
              </p>
            </div>

            {(values.kpi_type === "progressive" || values.kpi_type === "benchmark") && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {QUARTER_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`ind-target-${f.key}`} className="text-xs">{f.label}</Label>
                      <Input
                        id={`ind-target-${f.key}`} type="number" inputMode="decimal" placeholder="—"
                        value={values.quarter_targets[f.key]}
                        onChange={(e) => setValues((v) => ({
                          ...v, quarter_targets: { ...v.quarter_targets, [f.key]: e.target.value },
                        }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "H1 (Q1+Q2)", value: h1Computed },
                    { label: "H2 (Q3+Q4)", value: h2Computed },
                    { label: "Full Year",   value: fyComputed  },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border bg-background p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium text-muted-foreground">{value !== null ? value : "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {values.kpi_type === "binary" && (
              <div className="space-y-3">
                {[
                  { id: "ind-bin-h1", field: "h1"       as BinaryTargetPeriod, label: "Achieved by H1?"       },
                  { id: "ind-bin-fy", field: "fullyear" as BinaryTargetPeriod, label: "Achieved by Full Year?" },
                ].map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border bg-background p-3">
                    <Label htmlFor={b.id} className="text-sm font-normal">{b.label}</Label>
                    <Switch id={b.id} checked={values.binary_targets[b.field]}
                      onCheckedChange={(checked) => setValues((v) => ({
                        ...v, binary_targets: { ...v.binary_targets, [b.field]: checked },
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isEditMode ? "Save Changes" : "Save KPI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

type TgtEntry = { target_value: number | null; target_binary: boolean | null };

function WeightingAssignmentPage() {
  const { roles, person } = useAuth();
  const { entity_id }     = useEntity();
  const { selected_year } = useYear();

  const isCeo    = roles.includes("ceo");
  const isManager = roles.includes("manager");
  const isHrRep  = roles.includes("hr_rep");
  const allowed  = isCeo || isManager || isHrRep;
  const canDirectAssign = isCeo || isHrRep;

  /* ── State ── */
  const [employees,        setEmployees]        = useState<{ id: string; full_name: string }[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [loading,          setLoading]          = useState(false);
  const [saving,           setSaving]           = useState(false);

  // Group weights
  const [corpPct, setCorpPct] = useState(0);
  const [deptPct, setDeptPct] = useState(0);
  const [indPct,  setIndPct]  = useState(0);

  // KPI rows (full card data)
  const [corpRows, setCorpRows] = useState<WeightKpiRow[]>([]);
  const [deptRows, setDeptRows] = useState<WeightKpiRow[]>([]);
  const [indRows,  setIndRows]  = useState<WeightKpiRow[]>([]);

  // Item weights keyed by `${level}:${board_kpi_id}`
  const [itemWeights, setItemWeights] = useState<Record<string, number>>({});

  // Add individual KPI modal
  const [addIndKpiOpen, setAddIndKpiOpen] = useState(false);

  // Individual KPI inline edit mode
  const [indIsEditMode,  setIndIsEditMode]  = useState(false);
  const [indEditingRows, setIndEditingRows] = useState<Record<string, WeightKpiRow>>({});
  const [indIsSaving,    setIndIsSaving]    = useState(false);

  // Individual KPI multi-delete mode
  const [indIsDeleteMode,      setIndIsDeleteMode]      = useState(false);
  const [indSelectedForDelete, setIndSelectedForDelete] = useState<Set<string>>(new Set());
  const [indMultiDeleting,     setIndMultiDeleting]     = useState(false);
  const [indDeleteStep,        setIndDeleteStep]        = useState<1 | 2 | null>(null);

  /* ── Load employees ── */
  useEffect(() => {
    if (!allowed || !entity_id || !person?.id) return;
    let cancelled = false;
    void (async () => {
      setEmployeesLoading(true);
      let personIds: string[] | null = null;
      if (!isCeo && !isHrRep) {
        const { data: myDepts } = await supabase
          .from("people_org_departments").select("org_department_id").eq("person_id", person.id);
        const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
        if (deptIds.length === 0) {
          if (!cancelled) { setEmployees([]); setEmployeesLoading(false); }
          return;
        }
        const { data: peers } = await supabase
          .from("people_org_departments").select("person_id").in("org_department_id", deptIds);
        personIds = Array.from(new Set((peers ?? []).map((p) => p.person_id)));
      }

      let q = supabase.from("people").select("id, first_name, last_name")
        .eq("entity_id", entity_id).eq("is_active", true).order("last_name", { ascending: true });
      if (personIds) q = q.in("id", personIds);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) { toast.error("Failed to load employees."); setEmployees([]); }
      else setEmployees((data ?? []).map((p) => ({ id: p.id, full_name: `${p.first_name} ${p.last_name}` })));
      setEmployeesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [allowed, entity_id, person?.id, isCeo, isHrRep]);

  /* ── Load employee data ── */
  const loadEmployeeData = useCallback(async () => {
    if (!entity_id || !selectedPersonId) return;
    setLoading(true);

    /* Phase 1 — parallel, independent */
    const [groupRes, corpKpisRaw, orgDeptRes, funcDeptRes, indKpisRaw, itemWeightsRes] = await Promise.all([
      supabase
        .from("employee_kpi_group_weights")
        .select("corporate_weight_pct, department_weight_pct, individual_weight_pct")
        .eq("entity_id", entity_id).eq("person_id", selectedPersonId).eq("year", selected_year)
        .maybeSingle(),
      supabase
        .from("corporate_kpis")
        .select("id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
        .eq("entity_id", entity_id).eq("year", selected_year),
      supabase
        .from("people_org_departments").select("org_department_id").eq("person_id", selectedPersonId),
      supabase
        .from("people_functional_departments").select("functional_department_id").eq("person_id", selectedPersonId),
      supabase
        .from("individual_kpis")
        .select("id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
        .eq("entity_id", entity_id).eq("person_id", selectedPersonId)
        .eq("year", selected_year).eq("is_active", true).eq("status", "approved"),
      supabase
        .from("employee_kpi_item_weights")
        .select("kpi_assignment_id, kpi_level, weight_pct")
        .eq("entity_id", entity_id).eq("person_id", selectedPersonId).eq("year", selected_year),
    ]);

    /* Apply group weights immediately */
    if (groupRes.data) {
      setCorpPct(Number(groupRes.data.corporate_weight_pct)  || 0);
      setDeptPct(Number(groupRes.data.department_weight_pct) || 0);
      setIndPct( Number(groupRes.data.individual_weight_pct) || 0);
    } else { setCorpPct(0); setDeptPct(0); setIndPct(0); }

    /* Apply item weights immediately */
    const wMap: Record<string, number> = {};
    for (const r of itemWeightsRes.data ?? [])
      wMap[`${r.kpi_level}:${r.kpi_assignment_id}`] = Number(r.weight_pct) || 0;
    setItemWeights(wMap);

    const corpIds     = (corpKpisRaw.data ?? []).map((r) => r.id);
    const orgDeptIds  = (orgDeptRes.data  ?? []).map((d) => d.org_department_id);
    const funcDeptIds = (funcDeptRes.data ?? []).map((d) => d.functional_department_id);
    const indIds      = (indKpisRaw.data  ?? []).map((r) => r.id);

    /* Phase 2 — needs IDs from Phase 1 */
    const [corpTgtsRes, allDeptKpisRaw, indTgtsRes] = await Promise.all([
      corpIds.length > 0
        ? supabase.from("corporate_kpi_targets")
            .select("corporate_kpi_id, period, target_value, target_binary")
            .in("corporate_kpi_id", corpIds)
        : Promise.resolve({ data: [] as { corporate_kpi_id: string; period: string; target_value: number | null; target_binary: boolean | null }[] }),
      (orgDeptIds.length > 0 || funcDeptIds.length > 0)
        ? supabase.from("department_kpis")
            .select("id, org_department_id, functional_department_id, corporate_kpi_id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
            .eq("entity_id", entity_id).eq("year", selected_year)
        : Promise.resolve({ data: [] as unknown[] }),
      indIds.length > 0
        ? supabase.from("individual_kpi_targets")
            .select("individual_kpi_id, period, target_value, target_binary")
            .in("individual_kpi_id", indIds)
        : Promise.resolve({ data: [] as { individual_kpi_id: string; period: string; target_value: number | null; target_binary: boolean | null }[] }),
    ]);

    /* Filter dept KPIs to those in employee's org/func departments */
    type DeptKpiRaw = {
      id: string; org_department_id: string | null;
      functional_department_id: string | null; corporate_kpi_id: string | null;
      kpi_definitions: unknown;
    };
    const filteredDept = ((allDeptKpisRaw.data ?? []) as DeptKpiRaw[]).filter((r) => {
      const inOrg  = r.org_department_id  && orgDeptIds.includes(r.org_department_id);
      const inFunc = r.functional_department_id && funcDeptIds.includes(r.functional_department_id);
      return inOrg || inFunc;
    });

    const deptIds     = filteredDept.map((r) => r.id);
    const corpLinkIds = [...new Set(filteredDept.map((r) => r.corporate_kpi_id).filter(Boolean))] as string[];

    /* Phase 3 — needs dept IDs and corp link IDs from Phase 2 */
    const [deptTgtsRes, corpTitlesRes, deptLinksRes] = await Promise.all([
      deptIds.length > 0
        ? supabase.from("department_kpi_targets")
            .select("department_kpi_id, period, target_value, target_binary")
            .in("department_kpi_id", deptIds)
        : Promise.resolve({ data: [] as { department_kpi_id: string; period: string; target_value: number | null; target_binary: boolean | null }[] }),
      corpLinkIds.length > 0
        ? supabase.from("corporate_kpis").select("id, kpi_definitions(title)").in("id", corpLinkIds)
        : Promise.resolve({ data: [] as { id: string; kpi_definitions: unknown }[] }),
      corpIds.length > 0
        ? supabase.from("department_kpis")
            .select("corporate_kpi_id, kpi_definitions(title)")
            .in("corporate_kpi_id", corpIds)
        : Promise.resolve({ data: [] as { corporate_kpi_id: string | null; kpi_definitions: unknown }[] }),
    ]);

    /* Build target maps */
    function buildTgtMap<T extends Record<string, unknown>>(rows: T[], fk: keyof T) {
      const m = new Map<string, Record<string, TgtEntry>>();
      for (const r of rows) {
        const id = r[fk] as string;
        if (!m.has(id)) m.set(id, {});
        m.get(id)![r["period"] as string] = {
          target_value:  (r["target_value"]  as number | null)  ?? null,
          target_binary: (r["target_binary"] as boolean | null) ?? null,
        };
      }
      return m;
    }
    const corpTgtMap = buildTgtMap(corpTgtsRes.data ?? [], "corporate_kpi_id");
    const deptTgtMap = buildTgtMap(deptTgtsRes.data ?? [], "department_kpi_id");
    const indTgtMap  = buildTgtMap(indTgtsRes.data  ?? [], "individual_kpi_id");

    /* Corp KPI title map (for dept panel "Corporate KPI" column) */
    const corpTitleMap = new Map<string, string>();
    for (const ck of corpTitlesRes.data ?? []) {
      const title = (ck.kpi_definitions as { title: string } | null)?.title;
      if (title) corpTitleMap.set(ck.id, title);
    }

    /* Dept links map (for corp panel "Department KPI" column) */
    type DeptLinkRow = { corporate_kpi_id: string | null; kpi_definitions: unknown };
    const deptLinksMap = new Map<string, string[]>();
    for (const dl of (deptLinksRes.data ?? []) as unknown as DeptLinkRow[]) {
      const cid   = dl.corporate_kpi_id;
      const title = (dl.kpi_definitions as { title: string } | null)?.title;
      if (cid && title) {
        if (!deptLinksMap.has(cid)) deptLinksMap.set(cid, []);
        deptLinksMap.get(cid)!.push(title);
      }
    }

    /* Helper to convert a raw DB row to WeightKpiRow */
    type RawKpi = { id: string; kpi_definitions: unknown };
    function toRow(
      raw: RawKpi,
      tgtMap: Map<string, Record<string, TgtEntry>>,
      extra: Partial<WeightKpiRow> = {},
    ): WeightKpiRow {
      const def = raw.kpi_definitions as {
        id: string; title: string; description: string | null;
        driver: string; kpi_type: string; unit: string | null;
      } | null;
      const pt = tgtMap.get(raw.id) ?? {};
      return {
        id:                   def?.id ?? raw.id,
        board_kpi_id:         raw.id,
        title:                def?.title       ?? "Untitled",
        description:          def?.description ?? null,
        driver:               (def?.driver     ?? "growth")      as WeightKpiRow["driver"],
        kpi_type:             (def?.kpi_type   ?? "progressive") as WeightKpiRow["kpi_type"],
        unit:                 def?.unit ?? null,
        period_targets:       pt,
        yearend_target_value: pt["fullyear"]?.target_value  ?? null,
        yearend_target_binary: pt["fullyear"]?.target_binary ?? null,
        ...extra,
      };
    }

    setCorpRows(
      (corpKpisRaw.data ?? []).map((r) =>
        toRow(r as RawKpi, corpTgtMap, { linked_dept_kpi_titles: deptLinksMap.get(r.id) ?? null }),
      ),
    );

    setDeptRows(
      filteredDept.map((r) =>
        toRow(r as unknown as RawKpi, deptTgtMap, {
          corp_kpi_id:    r.corporate_kpi_id ?? null,
          corp_kpi_title: r.corporate_kpi_id ? (corpTitleMap.get(r.corporate_kpi_id) ?? null) : null,
        }),
      ),
    );

    setIndRows(
      (indKpisRaw.data ?? []).map((r) => {
        const def = r.kpi_definitions as { description: string | null } | null;
        const { deptRef } = extractDeptRef(def?.description ?? null);
        return toRow(r as RawKpi, indTgtMap, { dept_kpi_ref: deptRef });
      }),
    );

    setLoading(false);
  }, [entity_id, selectedPersonId, selected_year]);

  useEffect(() => {
    if (selectedPersonId) void loadEmployeeData();
  }, [selectedPersonId, loadEmployeeData]);

  /* ── Derived values ── */
  const getWeight = (level: KpiLevel, id: string) => itemWeights[`${level}:${id}`] ?? 0;
  const setWeight = (level: KpiLevel, id: string, n: number) =>
    setItemWeights((prev) => ({ ...prev, [`${level}:${id}`]: n }));

  const groupTotal = corpPct + deptPct + indPct;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const corpSubtotal = useMemo(
    () => corpRows.reduce((acc, r) => acc + getWeight("corporate",  r.board_kpi_id ?? ""), 0),
    [corpRows, itemWeights],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deptSubtotal = useMemo(
    () => deptRows.reduce((acc, r) => acc + getWeight("department", r.board_kpi_id ?? ""), 0),
    [deptRows, itemWeights],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const indSubtotal = useMemo(
    () => indRows.reduce((acc, r) => acc + getWeight("individual", r.board_kpi_id ?? ""), 0),
    [indRows, itemWeights],
  );

  const groupValid = groupTotal === 100;
  const corpValid  = corpRows.length === 0 || corpSubtotal === 100;
  const deptValid  = deptRows.length === 0 || deptSubtotal === 100;
  const indValid   = indRows.length  === 0 || indSubtotal  === 100;
  const allValid   = groupValid && corpValid && deptValid && indValid;

  const selectedEmployeeName = employees.find((e) => e.id === selectedPersonId)?.full_name ?? "employee";

  const groupSegments: BarSegment[] = [
    { key: "corporate",  pct: corpPct, bar: "bg-blue-500",    label: "Corporate"  },
    { key: "department", pct: deptPct, bar: "bg-emerald-500", label: "Department" },
    { key: "individual", pct: indPct,  bar: "bg-violet-500",  label: "Individual" },
  ];

  /* ── Save all weights ── */
  const handleSave = async () => {
    if (!entity_id || !selectedPersonId || !allValid) return;
    setSaving(true);

    const { error: groupErr } = await supabase
      .from("employee_kpi_group_weights")
      .upsert(
        { entity_id, person_id: selectedPersonId, year: selected_year,
          corporate_weight_pct: corpPct, department_weight_pct: deptPct, individual_weight_pct: indPct },
        { onConflict: "person_id,entity_id,year" },
      );
    if (groupErr) { toast.error("Failed to save group weights."); setSaving(false); return; }

    type Insert = {
      entity_id: string; person_id: string; year: number;
      kpi_level: KpiLevel; kpi_assignment_id: string; weight_pct: number;
    };
    const inserts: Insert[] = [];
    const push = (level: KpiLevel, rows: WeightKpiRow[]) => {
      for (const r of rows) {
        if (!r.board_kpi_id) continue;
        inserts.push({
          entity_id, person_id: selectedPersonId, year: selected_year,
          kpi_level: level, kpi_assignment_id: r.board_kpi_id,
          weight_pct: getWeight(level, r.board_kpi_id),
        });
      }
    };
    push("corporate",  corpRows);
    push("department", deptRows);
    push("individual", indRows);

    if (inserts.length > 0) {
      const { error: upErr } = await supabase
        .from("employee_kpi_item_weights")
        .upsert(inserts, { onConflict: "person_id,entity_id,year,kpi_level,kpi_assignment_id" });
      if (upErr) { toast.error("Failed to save item weights."); setSaving(false); return; }
    }

    setSaving(false);
    toast.success(`Weightings saved for ${selectedEmployeeName}.`);
  };

  /* ── Individual KPI inline edit ── */
  function enterIndEdit() {
    const rows: Record<string, WeightKpiRow> = {};
    for (const r of indRows)
      if (r.board_kpi_id) rows[r.board_kpi_id] = { ...r, period_targets: { ...r.period_targets } };
    setIndEditingRows(rows);
    setIndIsEditMode(true);
  }

  function cancelIndEdit() {
    setIndIsEditMode(false);
    setIndEditingRows({});
  }

  const handleIndRowChange = (boardKpiId: string, updater: (row: WeightKpiRow) => WeightKpiRow) => {
    setIndEditingRows((prev) => {
      const cur = prev[boardKpiId];
      if (!cur) return prev;
      return { ...prev, [boardKpiId]: updater(cur) };
    });
  };

  const handleIndSaveAll = async () => {
    setIndIsSaving(true);
    try {
      for (const [boardKpiId, row] of Object.entries(indEditingRows)) {
        if (!row.title.trim()) { toast.error("KPI title cannot be empty."); return; }

        const { error: defErr } = await supabase
          .from("kpi_definitions")
          .update({ title: row.title.trim(), description: row.description, kpi_type: row.kpi_type, driver: row.driver, unit: row.unit })
          .eq("id", row.id);
        if (defErr) throw new Error(defErr.message);

        const pt = row.period_targets ?? {};
        const isBinary = row.kpi_type === "binary";
        const targetRows: Record<string, unknown>[] = [];

        if (isBinary) {
          targetRows.push(
            { individual_kpi_id: boardKpiId, period: "h1",       target_binary: pt["h1"]?.target_binary       ?? false },
            { individual_kpi_id: boardKpiId, period: "fullyear", target_binary: pt["fullyear"]?.target_binary ?? false },
          );
        } else {
          const q1 = pt["q1"]?.target_value ?? null;
          const q2 = pt["q2"]?.target_value ?? null;
          const q3 = pt["q3"]?.target_value ?? null;
          const q4 = pt["q4"]?.target_value ?? null;
          const h1 = q1 !== null && q2 !== null ? q1 + q2 : null;
          const h2 = q3 !== null && q4 !== null ? q3 + q4 : null;
          const fy = h1 !== null && h2 !== null ? h1 + h2 : null;
          const push = (period: string, val: number | null) => {
            if (val !== null) targetRows.push({ individual_kpi_id: boardKpiId, period, target_value: val });
          };
          push("q1", q1); push("q2", q2); push("q3", q3); push("q4", q4);
          push("h1", h1); push("h2", h2); push("fullyear", fy);
        }

        if (targetRows.length > 0) {
          const { error: tErr } = await supabase
            .from("individual_kpi_targets")
            .upsert(targetRows as never, { onConflict: "individual_kpi_id,period" });
          if (tErr) throw new Error(tErr.message);
        }
      }
      toast.success("Individual KPIs updated.");
      setIndIsEditMode(false);
      setIndEditingRows({});
      void loadEmployeeData();
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIndIsSaving(false);
    }
  };

  /* ── Individual KPI multi-delete ── */
  function enterIndDelete() {
    setIndSelectedForDelete(new Set());
    setIndIsDeleteMode(true);
  }

  function cancelIndDelete() {
    setIndIsDeleteMode(false);
    setIndSelectedForDelete(new Set());
  }

  function toggleIndSelect(boardKpiId: string) {
    setIndSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(boardKpiId)) next.delete(boardKpiId); else next.add(boardKpiId);
      return next;
    });
  }

  const handleIndMultiDelete = async () => {
    const ids = [...indSelectedForDelete];
    if (ids.length === 0) return;
    setIndMultiDeleting(true);
    try {
      const { error: tErr } = await supabase.from("individual_kpi_targets").delete().in("individual_kpi_id", ids);
      if (tErr) throw new Error(tErr.message);
      const { error: kErr } = await supabase.from("individual_kpis").delete().in("id", ids);
      if (kErr) throw new Error(kErr.message);
      toast.success(`${ids.length} KPI${ids.length !== 1 ? "s" : ""} removed.`);
      cancelIndDelete();
      setIndDeleteStep(null);
      void loadEmployeeData();
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIndMultiDeleting(false);
    }
  };

  /* ── Access guard ── */
  if (!allowed) {
    return (
      <Card>
        <CardHeader><CardTitle>Access denied</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
        </CardContent>
      </Card>
    );
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-3">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Weighting Assignment</h1>
          <p className="text-sm text-muted-foreground">Assign KPI group and item weights for an employee.</p>
        </div>
        <Badge variant="secondary">Year: {selected_year}</Badge>
      </div>

      {/* Employee card — contains group weights inline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Left: employee selector */}
            <div className="space-y-1.5">
              <Label className="text-sm">Select employee</Label>
              <Select
                value={selectedPersonId ?? undefined}
                onValueChange={(v) => setSelectedPersonId(v)}
                disabled={employeesLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      employeesLoading ? "Loading employees…"
                        : employees.length === 0 ? "No employees available"
                          : "Choose an employee"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Right: group weights + allocation bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Group Weights</span>
                {selectedPersonId && !loading && <SubtotalLabel sum={groupTotal} />}
              </div>

              {selectedPersonId && loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading weights…
                </div>
              ) : selectedPersonId ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Corporate",  value: corpPct, set: setCorpPct, aria: "Corporate group weight"  },
                      { label: "Department", value: deptPct, set: setDeptPct, aria: "Department group weight" },
                      { label: "Individual", value: indPct,  set: setIndPct,  aria: "Individual group weight"  },
                    ].map(({ label, value, set, aria }) => (
                      <div key={label}>
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <div className="mt-1">
                          <WeightInput ariaLabel={aria} value={value} onChange={set} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Allocation</p>
                    <AllocationBar segments={groupSegments} empty={groupTotal === 0} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {GROUP_COLORS.map((g) => (
                        <span key={g.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className={cn("inline-block h-2 w-2 rounded-full", g.dot)} />
                          {g.label}:{" "}
                          {g.key === "corporate" ? corpPct : g.key === "department" ? deptPct : indPct}%
                        </span>
                      ))}
                    </div>
                  </div>

                  {!groupValid && (
                    <p className="text-sm text-destructive">
                      Group weights must sum to 100%. Current total: {groupTotal}%.
                    </p>
                  )}
                </>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">Select an employee to configure group weights.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Item Weights */}
      {selectedPersonId && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-5">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-base font-semibold">Section 2 — Item Weights</h2>
                <div className="grid grid-cols-1 gap-3">

                  {/* Corporate KPIs */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Corporate KPIs</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <WeightKpiTable
                        kpis={corpRows}
                        variant="corporate"
                        getWeight={(id) => getWeight("corporate", id)}
                        setWeight={(id, n) => setWeight("corporate", id, n)}
                      />
                    </CardContent>
                    {corpRows.length > 0 && corpSubtotal !== 100 && (
                      <div className="px-4 pb-3">
                        <p className="text-sm text-destructive">
                          Corporate KPI weights must sum to 100%. Current total: {corpSubtotal}%.
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Department KPIs */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Department KPIs</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <WeightKpiTable
                        kpis={deptRows}
                        variant="department"
                        getWeight={(id) => getWeight("department", id)}
                        setWeight={(id, n) => setWeight("department", id, n)}
                      />
                    </CardContent>
                    {deptRows.length > 0 && deptSubtotal !== 100 && (
                      <div className="px-4 pb-3">
                        <p className="text-sm text-destructive">
                          Department KPI weights must sum to 100%. Current total: {deptSubtotal}%.
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Individual KPIs */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">Individual KPIs</CardTitle>
                        {canDirectAssign && (
                          <div className="flex items-center gap-1.5">
                            {indIsEditMode ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={cancelIndEdit} disabled={indIsSaving}>
                                  Cancel
                                </Button>
                                <Button size="sm" onClick={() => void handleIndSaveAll()} disabled={indIsSaving}>
                                  {indIsSaving
                                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
                                    : "Save All"}
                                </Button>
                              </>
                            ) : indIsDeleteMode ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={cancelIndDelete} disabled={indMultiDeleting}>
                                  Cancel
                                </Button>
                                <Button
                                  size="sm" variant="destructive"
                                  disabled={indSelectedForDelete.size === 0 || indMultiDeleting}
                                  onClick={() => setIndDeleteStep(1)}
                                >
                                  Confirm Delete ({indSelectedForDelete.size})
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={enterIndEdit}
                                  disabled={indRows.length === 0}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                                </Button>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={enterIndDelete}
                                  disabled={indRows.length === 0}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                                </Button>
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="outline" onClick={() => setAddIndKpiOpen(true)}>
                                        <Plus className="h-3.5 w-3.5 mr-1" />Add KPI
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Assign a new individual KPI directly to this employee.</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <WeightKpiTable
                        kpis={indRows}
                        variant="individual"
                        getWeight={(id) => getWeight("individual", id)}
                        setWeight={(id, n) => setWeight("individual", id, n)}
                        isEditMode={indIsEditMode}
                        editingRows={indEditingRows}
                        onRowChange={handleIndRowChange}
                        isDeleteMode={indIsDeleteMode}
                        selectedForDelete={indSelectedForDelete}
                        onToggleSelect={toggleIndSelect}
                      />
                    </CardContent>
                    {indRows.length > 0 && indSubtotal !== 100 && (
                      <div className="px-4 pb-3">
                        <p className="text-sm text-destructive">
                          Individual KPI weights must sum to 100%. Current total: {indSubtotal}%.
                        </p>
                      </div>
                    )}
                  </Card>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => void handleSave()} disabled={saving || !allValid}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save weightings
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Add Individual KPI modal — CEO / HR Rep only */}
      {canDirectAssign && selectedPersonId && entity_id && (
        <AddIndividualKpiModal
          open={addIndKpiOpen}
          onOpenChange={setAddIndKpiOpen}
          personId={selectedPersonId}
          entityId={entity_id}
          year={selected_year}
          onSuccess={() => void loadEmployeeData()}
        />
      )}

      {/* Multi-delete confirmation — two-step */}
      <AlertDialog
        open={indDeleteStep !== null}
        onOpenChange={(open) => { if (!open) setIndDeleteStep(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {indDeleteStep === 1
                ? `Remove ${indSelectedForDelete.size} KPI${indSelectedForDelete.size !== 1 ? "s" : ""}?`
                : "Are you absolutely sure?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {indDeleteStep === 1
                ? `This will permanently remove ${indSelectedForDelete.size} individual KPI${indSelectedForDelete.size !== 1 ? "s" : ""} and all their targets. The KPI definitions will remain in the library.`
                : "This action cannot be undone. All targets for the selected KPIs will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIndDeleteStep(null)}>Cancel</AlertDialogCancel>
            {indDeleteStep === 1 ? (
              <Button onClick={() => setIndDeleteStep(2)}>Proceed</Button>
            ) : (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={indMultiDeleting}
                onClick={() => void handleIndMultiDelete()}
              >
                {indMultiDeleting ? "Removing…" : "Remove KPIs"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
