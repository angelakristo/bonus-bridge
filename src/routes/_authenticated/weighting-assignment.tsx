import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/weighting-assignment")({
  component: WeightingAssignmentPage,
});

/* ── Types ──────────────────────────────────────────────────────────────────── */

type EmployeeOption = { id: string; full_name: string };
type KpiLevel      = "corporate" | "department" | "individual";
type KpiType       = "progressive" | "binary" | "benchmark";
type KpiDriver     = "growth" | "efficiency" | "culture";
type QuarterPeriod      = "q1" | "q2" | "q3" | "q4";
type BinaryTargetPeriod = "h1" | "fullyear";

type ItemRow = {
  kpi_assignment_id: string;
  title: string;
  driver: KpiDriver;
};

type DeptKpiOption = { id: string; title: string };

/* ── Constants ──────────────────────────────────────────────────────────────── */

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100",  text: "text-green-800",  label: "Growth"     },
  efficiency: { bg: "bg-blue-100",   text: "text-blue-800",   label: "Efficiency" },
  culture:    { bg: "bg-amber-100",  text: "text-amber-800",  label: "Culture"    },
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

/* ── AllocationBar (identical to kpi-board) ─────────────────────────────────── */

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
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(clampPct(parseInt(e.target.value, 10)))}
        className="h-9 w-20 text-right"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

function SubtotalLabel({ sum }: { sum: number }) {
  const color =
    sum === 100 ? "text-green-600" : sum > 100 ? "text-destructive" : "text-muted-foreground";
  return <span className={cn("text-sm font-medium", color)}>{sum}% of 100%</span>;
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
  title: "",
  description: "",
  kpi_type: "progressive",
  driver: "growth",
  unitPreset: "",
  unitCustom: "",
  unitScoreOf: "",
  quarter_targets: { q1: "", q2: "", q3: "", q4: "" },
  binary_targets: { h1: false, fullyear: false },
};

function AddIndividualKpiModal({
  open,
  onOpenChange,
  personId,
  entityId,
  year,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  entityId: string;
  year: number;
  onSuccess: () => void;
}) {
  const { person } = useAuth();

  const [values, setValues]                 = useState<IndKpiForm>(IND_EMPTY);
  const [titleError, setTitleError]         = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [deptKpis, setDeptKpis]             = useState<DeptKpiOption[]>([]);
  const [deptKpisLoading, setDeptKpisLoading] = useState(false);
  const [selectedDeptKpiId, setSelectedDeptKpiId] = useState<string>("__none__");

  /* Load dept KPIs for employee's org departments */
  useEffect(() => {
    if (!open || !personId || !entityId) return;
    let cancelled = false;
    setDeptKpisLoading(true);
    void (async () => {
      const { data: depts } = await supabase
        .from("people_org_departments")
        .select("org_department_id")
        .eq("person_id", personId);

      const orgDeptIds = (depts ?? []).map((d) => d.org_department_id);
      if (orgDeptIds.length === 0) {
        if (!cancelled) { setDeptKpis([]); setDeptKpisLoading(false); }
        return;
      }

      const { data: dkpis } = await supabase
        .from("department_kpis")
        .select("id, kpi_definitions(title)")
        .eq("entity_id", entityId)
        .eq("year", year)
        .in("org_department_id", orgDeptIds);

      if (!cancelled) {
        setDeptKpis(
          (dkpis ?? []).map((r) => ({
            id: r.id,
            title:
              (r.kpi_definitions as unknown as { title: string } | null)
                ?.title ?? "Untitled",
          })),
        );
        setDeptKpisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, personId, entityId, year]);

  const update = <K extends keyof IndKpiForm>(key: K, val: IndKpiForm[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const q1 = parseNum(values.quarter_targets.q1);
  const q2 = parseNum(values.quarter_targets.q2);
  const q3 = parseNum(values.quarter_targets.q3);
  const q4 = parseNum(values.quarter_targets.q4);
  const h1Computed       = q1 !== null && q2 !== null ? q1 + q2 : null;
  const h2Computed       = q3 !== null && q4 !== null ? q3 + q4 : null;
  const fyComputed       = h1Computed !== null && h2Computed !== null ? h1Computed + h2Computed : null;

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

  const handleCancel = () => {
    if (saving) return;
    resetForm();
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!values.title.trim()) { setTitleError("KPI Title is required."); return; }
    setTitleError(null);
    if (!person?.id) return toast.error("Cannot identify current user.");

    setSaving(true);
    try {
      const unit = deriveUnit(values.unitPreset, values.unitCustom, values.unitScoreOf);
      const isBinary = values.kpi_type === "binary";

      /* Prepend dept KPI reference to description if one is selected */
      let description = values.description.trim() || null;
      if (selectedDeptKpiId !== "__none__") {
        const refTitle = deptKpis.find((d) => d.id === selectedDeptKpiId)?.title ?? "";
        const refNote  = `Aligns to dept KPI: ${refTitle}.`;
        description = description ? `${refNote} ${description}` : refNote;
      }

      /* 1. Insert kpi_definition */
      const { data: defData, error: defErr } = await supabase
        .from("kpi_definitions")
        .insert({
          entity_id: entityId,
          title: values.title.trim(),
          description,
          kpi_type: values.kpi_type,
          driver: values.driver,
          unit,
          year,
          is_active: true,
          created_by: person.id,
        })
        .select("id")
        .single();
      if (defErr || !defData) throw new Error(defErr?.message ?? "Failed to create KPI definition.");

      /* 2. Get display_order */
      const { count: existingCount } = await supabase
        .from("individual_kpis")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("year", year)
        .eq("person_id", personId);

      /* 3. Insert individual_kpi */
      const { data: indData, error: indErr } = await supabase
        .from("individual_kpis")
        .insert({
          entity_id:          entityId,
          person_id:          personId,
          kpi_definition_id:  defData.id,
          year,
          display_order:      (existingCount ?? 0) + 1,
          status:             "approved",
          proposed_by:        person.id,
          approved_by:        person.id,
          is_active:          true,
        })
        .select("id")
        .single();
      if (indErr || !indData) throw new Error(indErr?.message ?? "Failed to create individual KPI.");

      /* 4. Insert targets */
      const targetRows = isBinary
        ? buildBinaryRows("individual_kpi_id", indData.id)
        : buildNumericRows("individual_kpi_id", indData.id);
      if (targetRows.length > 0) {
        const { error: tErr } = await supabase
          .from("individual_kpi_targets")
          .insert(targetRows as never);
        if (tErr) throw new Error(tErr.message);
      }

      toast.success("Individual KPI assigned to employee.");
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
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { if (!next) resetForm(); onOpenChange(next); } }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add Individual KPI</DialogTitle>
          <DialogDescription>
            Define the KPI for this employee. It will be assigned directly and immediately visible in their weighting profile.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">

          {/* Department KPI Reference */}
          <div className="space-y-1.5">
            <Label>Department KPI Reference</Label>
            <Select
              value={selectedDeptKpiId}
              onValueChange={setSelectedDeptKpiId}
              disabled={deptKpisLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={deptKpisLoading ? "Loading…" : "None (standalone KPI)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (standalone KPI)</SelectItem>
                {deptKpis.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which department KPI this individual KPI supports, if applicable.
            </p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-title">
              KPI Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ind-kpi-title"
              value={values.title}
              onChange={(e) => { update("title", e.target.value); if (titleError) setTitleError(null); }}
              placeholder="e.g. Personal Revenue Target"
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ind-kpi-desc">Description</Label>
            <Textarea
              id="ind-kpi-desc"
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional context about this KPI"
              rows={2}
            />
          </div>

          {/* KPI Type */}
          <div className="space-y-2">
            <Label>KPI Type</Label>
            <RadioGroup
              value={values.kpi_type}
              onValueChange={(v) => update("kpi_type", v as KpiType)}
              className="gap-2"
            >
              {[
                { id: "ind-type-prog",  value: "progressive", label: "Progressive", sub: "Tracked cumulatively by value" },
                { id: "ind-type-bin",   value: "binary",      label: "Binary",      sub: "Achieved or not achieved"       },
                { id: "ind-type-bench", value: "benchmark",   label: "Benchmark",   sub: "Point-in-time score"            },
              ].map((t) => (
                <Label
                  key={t.id}
                  htmlFor={t.id}
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
              <SelectTrigger id="ind-kpi-unit">
                <SelectValue placeholder="Select unit (optional)" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_PRESETS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {values.unitPreset === "score" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Score out of</span>
                <Input
                  type="number" min={1} placeholder="e.g. 5"
                  value={values.unitScoreOf}
                  onChange={(e) => update("unitScoreOf", e.target.value)}
                  className="w-24"
                />
              </div>
            )}
            {values.unitPreset === "custom" && (
              <Input
                placeholder="Enter unit label"
                value={values.unitCustom}
                onChange={(e) => update("unitCustom", e.target.value)}
              />
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
                        id={`ind-target-${f.key}`}
                        type="number"
                        inputMode="decimal"
                        placeholder="—"
                        value={values.quarter_targets[f.key]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            quarter_targets: { ...v.quarter_targets, [f.key]: e.target.value },
                          }))
                        }
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
                      <p className="text-sm font-medium text-muted-foreground">
                        {value !== null ? value : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {values.kpi_type === "binary" && (
              <div className="space-y-3">
                {[
                  { id: "ind-bin-h1",  field: "h1"       as BinaryTargetPeriod, label: "Achieved by H1?"       },
                  { id: "ind-bin-fy",  field: "fullyear" as BinaryTargetPeriod, label: "Achieved by Full Year?" },
                ].map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border bg-background p-3"
                  >
                    <Label htmlFor={b.id} className="text-sm font-normal">{b.label}</Label>
                    <Switch
                      id={b.id}
                      checked={values.binary_targets[b.field]}
                      onCheckedChange={(checked) =>
                        setValues((v) => ({
                          ...v,
                          binary_targets: { ...v.binary_targets, [b.field]: checked },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save KPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

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
  const [employees,         setEmployees]         = useState<EmployeeOption[]>([]);
  const [employeesLoading,  setEmployeesLoading]  = useState(true);
  const [selectedPersonId,  setSelectedPersonId]  = useState<string | null>(null);
  const [loading,           setLoading]           = useState(false);
  const [saving,            setSaving]            = useState(false);

  // Group weights
  const [corpPct, setCorpPct] = useState(0);
  const [deptPct, setDeptPct] = useState(0);
  const [indPct,  setIndPct]  = useState(0);

  // Items
  const [corpItems, setCorpItems] = useState<ItemRow[]>([]);
  const [deptItems, setDeptItems] = useState<ItemRow[]>([]);
  const [indItems,  setIndItems]  = useState<ItemRow[]>([]);

  // Item weights keyed by `${level}:${kpi_assignment_id}`
  const [itemWeights, setItemWeights] = useState<Record<string, number>>({});

  // Add Individual KPI modal
  const [addIndKpiOpen, setAddIndKpiOpen] = useState(false);

  /* ── Load employees ── */
  useEffect(() => {
    if (!allowed || !entity_id || !person?.id) return;
    let cancelled = false;
    void (async () => {
      setEmployeesLoading(true);

      let personIds: string[] | null = null;
      if (!isCeo) {
        const { data: myDepts } = await supabase
          .from("people_org_departments")
          .select("org_department_id")
          .eq("person_id", person.id);
        const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
        if (deptIds.length === 0) {
          if (!cancelled) { setEmployees([]); setEmployeesLoading(false); }
          return;
        }
        const { data: peers } = await supabase
          .from("people_org_departments")
          .select("person_id")
          .in("org_department_id", deptIds);
        personIds = Array.from(new Set((peers ?? []).map((p) => p.person_id)));
      }

      let q = supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("entity_id", entity_id)
        .eq("is_active", true)
        .order("last_name", { ascending: true });
      if (personIds) q = q.in("id", personIds);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load employees.");
        setEmployees([]);
      } else {
        setEmployees(
          (data ?? []).map((p) => ({ id: p.id, full_name: `${p.first_name} ${p.last_name}` })),
        );
      }
      setEmployeesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [allowed, entity_id, person?.id, isCeo]);

  /* ── Load employee data ── */
  const loadEmployeeData = useCallback(async () => {
    if (!entity_id || !selectedPersonId) return;
    setLoading(true);

    const [
      groupRes, corpRes, orgDeptRes, funcDeptRes, indRes, itemWeightsRes,
    ] = await Promise.all([
      supabase
        .from("employee_kpi_group_weights")
        .select("corporate_weight_pct, department_weight_pct, individual_weight_pct")
        .eq("entity_id", entity_id)
        .eq("person_id", selectedPersonId)
        .eq("year", selected_year)
        .maybeSingle(),
      supabase
        .from("corporate_kpis")
        .select("id, kpi_definitions(title, driver)")
        .eq("entity_id", entity_id)
        .eq("year", selected_year),
      supabase
        .from("people_org_departments")
        .select("org_department_id")
        .eq("person_id", selectedPersonId),
      supabase
        .from("people_functional_departments")
        .select("functional_department_id")
        .eq("person_id", selectedPersonId),
      supabase
        .from("individual_kpis")
        .select("id, kpi_definitions(title, driver)")
        .eq("entity_id", entity_id)
        .eq("person_id", selectedPersonId)
        .eq("year", selected_year)
        .eq("is_active", true)
        .eq("status", "approved"),
      supabase
        .from("employee_kpi_item_weights")
        .select("kpi_assignment_id, kpi_level, weight_pct")
        .eq("entity_id", entity_id)
        .eq("person_id", selectedPersonId)
        .eq("year", selected_year),
    ]);

    if (groupRes.data) {
      setCorpPct(Number(groupRes.data.corporate_weight_pct)  || 0);
      setDeptPct(Number(groupRes.data.department_weight_pct) || 0);
      setIndPct( Number(groupRes.data.individual_weight_pct) || 0);
    } else {
      setCorpPct(0); setDeptPct(0); setIndPct(0);
    }

    const mapItems = (rows: Array<{ id: string; kpi_definitions: unknown }> | null): ItemRow[] =>
      (rows ?? []).map((r) => {
        const def = r.kpi_definitions as { title: string; driver: KpiDriver } | null;
        return { kpi_assignment_id: r.id, title: def?.title ?? "Untitled KPI", driver: def?.driver ?? "growth" };
      });

    setCorpItems(mapItems(corpRes.data));
    setIndItems(mapItems(indRes.data));

    const orgDeptIds  = (orgDeptRes.data  ?? []).map((d) => d.org_department_id);
    const funcDeptIds = (funcDeptRes.data ?? []).map((d) => d.functional_department_id);

    let deptRows: ItemRow[] = [];
    if (orgDeptIds.length > 0 || funcDeptIds.length > 0) {
      const { data: dData, error: dErr } = await supabase
        .from("department_kpis")
        .select("id, org_department_id, functional_department_id, kpi_definitions(title, driver)")
        .eq("entity_id", entity_id)
        .eq("year", selected_year);
      if (!dErr) {
        deptRows = mapItems(
          (dData ?? []).filter((r) => {
            const inOrg  = r.org_department_id  && orgDeptIds.includes(r.org_department_id);
            const inFunc = r.functional_department_id && funcDeptIds.includes(r.functional_department_id);
            return inOrg || inFunc;
          }),
        );
      }
    }
    setDeptItems(deptRows);

    const map: Record<string, number> = {};
    for (const r of itemWeightsRes.data ?? []) {
      map[`${r.kpi_level}:${r.kpi_assignment_id}`] = Number(r.weight_pct) || 0;
    }
    setItemWeights(map);
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

  const sumItems = (level: KpiLevel, items: ItemRow[]) =>
    items.reduce((acc, it) => acc + getWeight(level, it.kpi_assignment_id), 0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const corpSubtotal = useMemo(() => sumItems("corporate",  corpItems), [corpItems, itemWeights]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deptSubtotal = useMemo(() => sumItems("department", deptItems), [deptItems, itemWeights]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const indSubtotal  = useMemo(() => sumItems("individual", indItems),  [indItems,  itemWeights]);

  const groupValid = groupTotal === 100;
  const corpValid  = corpItems.length === 0 || corpSubtotal === 100;
  const deptValid  = deptItems.length === 0 || deptSubtotal === 100;
  const indValid   = indItems.length  === 0 || indSubtotal  === 100;
  const allValid   = groupValid && corpValid && deptValid && indValid;

  const selectedEmployeeName =
    employees.find((e) => e.id === selectedPersonId)?.full_name ?? "employee";

  /* ── Group bar segments ── */
  const groupSegments: BarSegment[] = [
    { key: "corporate",  pct: corpPct, bar: "bg-blue-500",    label: "Corporate"  },
    { key: "department", pct: deptPct, bar: "bg-emerald-500", label: "Department" },
    { key: "individual", pct: indPct,  bar: "bg-violet-500",  label: "Individual" },
  ];

  /* ── Save ── */
  const handleSave = async () => {
    if (!entity_id || !selectedPersonId || !allValid) return;
    setSaving(true);

    const { error: groupErr } = await supabase
      .from("employee_kpi_group_weights")
      .upsert(
        {
          entity_id,
          person_id:              selectedPersonId,
          year:                   selected_year,
          corporate_weight_pct:   corpPct,
          department_weight_pct:  deptPct,
          individual_weight_pct:  indPct,
        },
        { onConflict: "person_id,entity_id,year" },
      );

    if (groupErr) {
      toast.error("Failed to save group weights.");
      setSaving(false);
      return;
    }

    type Insert = {
      entity_id: string; person_id: string; year: number;
      kpi_level: KpiLevel; kpi_assignment_id: string; weight_pct: number;
    };
    const inserts: Insert[] = [];
    const push = (level: KpiLevel, items: ItemRow[]) => {
      for (const it of items) {
        inserts.push({
          entity_id, person_id: selectedPersonId, year: selected_year,
          kpi_level: level, kpi_assignment_id: it.kpi_assignment_id,
          weight_pct: getWeight(level, it.kpi_assignment_id),
        });
      }
    };
    push("corporate", corpItems);
    push("department", deptItems);
    push("individual", indItems);

    if (inserts.length > 0) {
      const { error: upErr } = await supabase
        .from("employee_kpi_item_weights")
        .upsert(inserts, {
          onConflict: "person_id,entity_id,year,kpi_level,kpi_assignment_id",
        });
      if (upErr) {
        toast.error("Failed to save item weights.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(`Weightings saved for ${selectedEmployeeName}.`);
  };

  /* ── Access guard ── */
  if (!allowed) {
    return (
      <Card>
        <CardHeader><CardTitle>Access denied</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  /* ── Item panel renderer ── */
  const renderItemPanel = (
    title: string,
    level: KpiLevel,
    items: ItemRow[],
    subtotal: number,
    onAddKpi?: () => void,
  ) => {
    const showError = items.length > 0 && subtotal !== 100;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            {onAddKpi && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={onAddKpi}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Add KPI
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Assign a new individual KPI directly to this employee.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No KPIs assigned in this group.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const ds = DRIVER_STYLE[it.driver];
                return (
                  <div
                    key={it.kpi_assignment_id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{it.title}</span>
                      <Badge variant="outline" className={cn("border-0", ds.bg, ds.text)}>
                        {ds.label}
                      </Badge>
                    </div>
                    <WeightInput
                      ariaLabel={`Weight for ${it.title}`}
                      value={getWeight(level, it.kpi_assignment_id)}
                      onChange={(n) => setWeight(level, it.kpi_assignment_id, n)}
                    />
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</span>
                <SubtotalLabel sum={subtotal} />
              </div>
              {showError && (
                <p className="pt-1 text-sm text-destructive">
                  {title} weights must sum to 100%. Current total: {subtotal}%.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-3">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Weighting Assignment</h1>
          <p className="text-sm text-muted-foreground">
            Assign KPI group and item weights for an employee.
          </p>
        </div>
        <Badge variant="secondary">Year: {selected_year}</Badge>
      </div>

      {/* ── Employee card (contains group weights inline) ── */}
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
                      employeesLoading
                        ? "Loading employees…"
                        : employees.length === 0
                          ? "No employees available"
                          : "Choose an employee"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Right: Group weights + allocation bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Group Weights</span>
                {selectedPersonId && !loading && (
                  <SubtotalLabel sum={groupTotal} />
                )}
              </div>

              {selectedPersonId && loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading weights…
                </div>
              ) : selectedPersonId ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Corporate",  value: corpPct,  set: setCorpPct,  aria: "Corporate group weight" },
                      { label: "Department", value: deptPct,  set: setDeptPct,  aria: "Department group weight" },
                      { label: "Individual", value: indPct,   set: setIndPct,   aria: "Individual group weight" },
                    ].map(({ label, value, set, aria }) => (
                      <div key={label}>
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <div className="mt-1">
                          <WeightInput ariaLabel={aria} value={value} onChange={set} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Stacked allocation bar */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Allocation
                    </p>
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
                <p className="py-2 text-sm text-muted-foreground">
                  Select an employee to configure group weights.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Item weight panels ── */}
      {selectedPersonId && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-5">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-base font-semibold">
                  Section 2 — Item Weights
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {renderItemPanel("Corporate KPIs",  "corporate",  corpItems, corpSubtotal)}
                  {renderItemPanel("Department KPIs", "department", deptItems, deptSubtotal)}
                  {renderItemPanel(
                    "Individual KPIs",
                    "individual",
                    indItems,
                    indSubtotal,
                    canDirectAssign ? () => setAddIndKpiOpen(true) : undefined,
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => void handleSave()} disabled={saving || !allValid}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
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
    </div>
  );
}
