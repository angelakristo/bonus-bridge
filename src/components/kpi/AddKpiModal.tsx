import { useState, useEffect } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";

export type KpiLevel = "corporate" | "department" | "individual";
export type KpiType = "progressive" | "binary" | "benchmark";
export type KpiDriver = "growth" | "efficiency" | "culture";

export type QuarterPeriod = "q1" | "q2" | "q3" | "q4";
export type BinaryTargetPeriod = "h1" | "fullyear";

export type AddKpiFormValues = {
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When omitted the modal renders a level-picker at the top. */
  level?: KpiLevel;
  onSuccess: () => void;
  /** Pre-set when level === "department" and called from the KPI Board. */
  org_department_id?: string | null;
  /** Pre-set when level === "department" and called from the KPI Board. */
  functional_department_id?: string | null;
  /** Pre-set when level === "individual" and called from the KPI Board. */
  person_id?: string | null;
  /** Edit mode: the kpi_definitions row to update. */
  editKpiDefId?: string | null;
  /** Edit mode: the corporate_kpis or department_kpis row whose targets to update. */
  editBoardKpiId?: string | null;
  /** Edit mode: which target table to upsert into. */
  editBoardLevel?: "corporate" | "department" | null;
};

const LEVEL_LABEL: Record<KpiLevel, string> = {
  corporate:  "Corporate",
  department: "Department",
  individual: "Individual",
};

const UNIT_PRESETS = [
  { value: "%",      label: "% (Percentage)"  },
  { value: "EUR",    label: "EUR (Euros)"      },
  { value: "Count",  label: "Count"            },
  { value: "score",  label: "Score out of..."  },
  { value: "custom", label: "Custom..."        },
];

const QUARTER_FIELDS: { key: QuarterPeriod; label: string }[] = [
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" },
];

const EMPTY: AddKpiFormValues = {
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

function deriveUnit(preset: string, custom: string, scoreOf: string): string | null {
  if (preset === "score") {
    const n = scoreOf.trim();
    return n ? `Score out of ${n}` : "Score";
  }
  if (preset === "custom") return custom.trim() || null;
  return preset || null;
}

function parseNum(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function syncFuncToLocalStorage(entityId: string, orgDeptId: string, funcDeptId: string) {
  const key = `bb_dept_setup_${entityId}`;
  try {
    const stored = localStorage.getItem(key);
    const assignments: Record<string, string[]> = stored
      ? (JSON.parse(stored) as Record<string, string[]>)
      : {};
    const existing = assignments[orgDeptId] ?? [];
    if (!existing.includes(funcDeptId)) {
      assignments[orgDeptId] = [...existing, funcDeptId];
      localStorage.setItem(key, JSON.stringify(assignments));
    }
  } catch {
    // localStorage unavailable (SSR)
  }
}

function reverseUnit(unit: string | null): { unitPreset: string; unitCustom: string; unitScoreOf: string } {
  if (!unit) return { unitPreset: "", unitCustom: "", unitScoreOf: "" };
  if (unit === "%" || unit === "EUR" || unit === "Count")
    return { unitPreset: unit, unitCustom: "", unitScoreOf: "" };
  const m = unit.match(/^Score out of (\d+)$/);
  if (m) return { unitPreset: "score", unitCustom: "", unitScoreOf: m[1] };
  return { unitPreset: "custom", unitCustom: unit, unitScoreOf: "" };
}

export function AddKpiModal({
  open,
  onOpenChange,
  level: levelProp,
  onSuccess,
  org_department_id: orgDeptIdProp = null,
  functional_department_id = null,
  person_id: personIdProp = null,
  editKpiDefId = null,
  editBoardKpiId = null,
  editBoardLevel = null,
}: Props) {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const isEditMode = !!editKpiDefId;

  const [values, setValues] = useState<AddKpiFormValues>(EMPTY);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Level / selector state (used when levelProp is not provided)
  const [internalLevel, setInternalLevel] = useState<KpiLevel>("corporate");
  const [selectedOrgDeptId, setSelectedOrgDeptId] = useState<string>("");
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [selectedFuncDeptId, setSelectedFuncDeptId] = useState<string>("");
  const [orgDepts, setOrgDepts] = useState<{ id: string; name: string }[]>([]);
  const [funcDepts, setFuncDepts] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; first_name: string; last_name: string }[]>([]);

  // Corporate KPI link (for department KPIs)
  const [corpKpisForLink, setCorpKpisForLink] = useState<{ id: string; title: string }[]>([]);
  const [selectedCorpKpiId, setSelectedCorpKpiId] = useState<string>("__none__");

  const effectiveLevel = levelProp ?? internalLevel;
  const effectiveOrgDeptId = orgDeptIdProp ?? (effectiveLevel === "department" ? selectedOrgDeptId || null : null);
  const effectivePersonId = personIdProp ?? (effectiveLevel === "individual" ? selectedPersonId || null : null);
  const effectiveFuncDeptId = functional_department_id ?? (selectedFuncDeptId || null);

  // Load functional departments when modal opens
  useEffect(() => {
    if (!open) return;
    supabase
      .from("functions")
      .select("id, name")
      .order("name")
      .then(({ data }) => setFuncDepts(data ?? []));
  }, [open]);

  // Load corporate KPIs for the "Supports Corporate KPI" selector (department level)
  useEffect(() => {
    if (!open || !entity_id || effectiveLevel !== "department") {
      setCorpKpisForLink([]);
      return;
    }
    supabase
      .from("corporate_kpis")
      .select("id, kpi_definitions(title)")
      .eq("entity_id", entity_id)
      .eq("year", selected_year)
      .order("display_order")
      .then(({ data }) => {
        setCorpKpisForLink(
          (data ?? []).map((row) => ({
            id: row.id,
            title: (row.kpi_definitions as unknown as { title: string } | null)?.title ?? "Untitled",
          })),
        );
      });
  }, [open, entity_id, selected_year, effectiveLevel]);

  // Pre-populate form in edit mode
  useEffect(() => {
    if (!open || !editKpiDefId) return;
    void (async () => {
      const { data: def } = await supabase
        .from("kpi_definitions")
        .select("title, description, kpi_type, driver, unit")
        .eq("id", editKpiDefId)
        .single();
      if (!def) return;

      const unitFields = reverseUnit(def.unit);
      let quarter_targets: Record<QuarterPeriod, string> = { q1: "", q2: "", q3: "", q4: "" };
      let binary_targets: Record<BinaryTargetPeriod, boolean> = { h1: false, fullyear: false };

      if (editBoardKpiId && editBoardLevel) {
        const tgtTable = editBoardLevel === "corporate" ? "corporate_kpi_targets" : "department_kpi_targets";
        const fkCol    = editBoardLevel === "corporate" ? "corporate_kpi_id"      : "department_kpi_id";
        const { data: tgts } = await supabase
          .from(tgtTable as "corporate_kpi_targets")
          .select("period, target_value, target_binary")
          .eq(fkCol as "corporate_kpi_id", editBoardKpiId);
        for (const t of tgts ?? []) {
          if (["q1", "q2", "q3", "q4"].includes(t.period))
            quarter_targets[t.period as QuarterPeriod] = t.target_value != null ? String(t.target_value) : "";
          if (t.period === "h1")      binary_targets.h1       = t.target_binary ?? false;
          if (t.period === "fullyear") binary_targets.fullyear = t.target_binary ?? false;
        }

        // Pre-populate corp link if editing a dept KPI
        if (editBoardLevel === "department") {
          const { data: deptRow } = await supabase
            .from("department_kpis")
            .select("corporate_kpi_id")
            .eq("id", editBoardKpiId)
            .single();
          setSelectedCorpKpiId(deptRow?.corporate_kpi_id ?? "__none__");
        }
      }

      setValues({
        title: def.title,
        description: def.description ?? "",
        kpi_type: def.kpi_type as KpiType,
        driver: def.driver as KpiDriver,
        ...unitFields,
        quarter_targets,
        binary_targets,
      });
    })();
  }, [open, editKpiDefId, editBoardKpiId, editBoardLevel]);

  // Load org departments + people for internal level picker
  useEffect(() => {
    if (!open || levelProp || !entity_id) return;
    supabase
      .from("organisational_departments")
      .select("id, name")
      .eq("entity_id", entity_id)
      .order("name")
      .then(({ data }) => setOrgDepts(data ?? []));
    supabase
      .from("people")
      .select("id, first_name, last_name")
      .eq("entity_id", entity_id)
      .order("last_name")
      .then(({ data }) => setPeople(data ?? []));
  }, [open, levelProp, entity_id]);

  const update = <K extends keyof AddKpiFormValues>(key: K, value: AddKpiFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const q1 = parseNum(values.quarter_targets.q1);
  const q2 = parseNum(values.quarter_targets.q2);
  const q3 = parseNum(values.quarter_targets.q3);
  const q4 = parseNum(values.quarter_targets.q4);
  const h1Computed        = q1 !== null && q2 !== null ? q1 + q2 : null;
  const h2Computed        = q3 !== null && q4 !== null ? q3 + q4 : null;
  const fullYearComputed  = h1Computed !== null && h2Computed !== null ? h1Computed + h2Computed : null;

  const buildNumericTargetRows = (fkName: string, fkValue: string) => {
    const rows: Record<string, unknown>[] = [];
    const quarters: [QuarterPeriod, number | null][] = [["q1", q1], ["q2", q2], ["q3", q3], ["q4", q4]];
    for (const [period, val] of quarters) {
      if (val !== null) rows.push({ [fkName]: fkValue, period, target_value: val });
    }
    if (h1Computed !== null)       rows.push({ [fkName]: fkValue, period: "h1",       target_value: h1Computed });
    if (h2Computed !== null)       rows.push({ [fkName]: fkValue, period: "h2",       target_value: h2Computed });
    if (fullYearComputed !== null) rows.push({ [fkName]: fkValue, period: "fullyear", target_value: fullYearComputed });
    return rows;
  };

  const buildBinaryTargetRows = (fkName: string, fkValue: string) => [
    { [fkName]: fkValue, period: "h1",       target_binary: values.binary_targets.h1       },
    { [fkName]: fkValue, period: "fullyear", target_binary: values.binary_targets.fullyear },
  ];

  const handleSave = async () => {
    if (!values.title.trim()) { setTitleError("KPI Title is required."); return; }
    setTitleError(null);

    if (!entity_id)  return toast.error("No entity selected.");
    if (!person?.id) return toast.error("Cannot identify current user.");
    if (!isEditMode && effectiveLevel === "department" && !effectiveOrgDeptId && !functional_department_id)
      return toast.error("Please select a department.");
    if (!isEditMode && effectiveLevel === "department" && !effectiveFuncDeptId)
      return toast.error("Please select a function for this KPI.");
    if (effectiveLevel === "individual" && !effectivePersonId)
      return toast.error("Please select an employee.");

    setSaving(true);
    try {
      const unit     = deriveUnit(values.unitPreset, values.unitCustom, values.unitScoreOf);
      const isBinary = values.kpi_type === "binary";

      // ── Edit mode ─────────────────────────────────────────────────────────
      if (isEditMode && editKpiDefId) {
        const updRes = await supabase
          .from("kpi_definitions")
          .update({ title: values.title.trim(), description: values.description.trim() || null, kpi_type: values.kpi_type, driver: values.driver, unit })
          .eq("id", editKpiDefId);
        if (updRes.error) throw new Error(updRes.error.message);

        if (editBoardKpiId && editBoardLevel) {
          const tgtTable  = editBoardLevel === "corporate" ? "corporate_kpi_targets" : "department_kpi_targets";
          const fkCol     = editBoardLevel === "corporate" ? "corporate_kpi_id"      : "department_kpi_id";
          const targetRows = isBinary
            ? buildBinaryTargetRows(fkCol, editBoardKpiId)
            : buildNumericTargetRows(fkCol, editBoardKpiId);
          if (targetRows.length > 0) {
            const upRes = await supabase
              .from(tgtTable as "corporate_kpi_targets")
              .upsert(targetRows as never, { onConflict: `${fkCol},period` });
            if (upRes.error) throw new Error(upRes.error.message);
          }

          // Update corporate_kpi_id link for dept KPIs
          if (editBoardLevel === "department") {
            await supabase
              .from("department_kpis")
              .update({ corporate_kpi_id: selectedCorpKpiId === "__none__" ? null : selectedCorpKpiId || null })
              .eq("id", editBoardKpiId);
          }
        }

        toast.success("KPI updated.");
        onSuccess();
        resetForm();
        onOpenChange(false);
        return;
      }

      // ── Add mode ──────────────────────────────────────────────────────────
      const defRes = await supabase
        .from("kpi_definitions")
        .insert({
          entity_id,
          title: values.title.trim(),
          description: values.description.trim() || null,
          kpi_type: values.kpi_type,
          driver: values.driver,
          unit,
          year: selected_year,
          is_active: true,
          created_by: person.id,
        })
        .select("id")
        .single();
      if (defRes.error || !defRes.data)
        throw new Error(defRes.error?.message ?? "Failed to insert KPI definition.");
      const kpiDefinitionId = defRes.data.id;

      if (effectiveLevel === "corporate") {
        const { count: existingCount } = await supabase
          .from("corporate_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year);
        const display_order = (existingCount ?? 0) + 1;

        const corpRes = await supabase
          .from("corporate_kpis")
          .insert({ entity_id, kpi_definition_id: kpiDefinitionId, year: selected_year, display_order })
          .select("id")
          .single();
        if (corpRes.error || !corpRes.data)
          throw new Error(corpRes.error?.message ?? "Failed to insert corporate KPI.");

        const targetRows = isBinary
          ? buildBinaryTargetRows("corporate_kpi_id", corpRes.data.id)
          : buildNumericTargetRows("corporate_kpi_id", corpRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase.from("corporate_kpi_targets").insert(targetRows as never);
          if (tRes.error) throw new Error(tRes.error.message);
        }
      } else if (effectiveLevel === "department") {
        const filterCol = effectiveOrgDeptId ? "org_department_id" : "functional_department_id";
        const filterVal = (effectiveOrgDeptId ?? functional_department_id) as string;
        const { count: existingCount } = await supabase
          .from("department_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year)
          .eq(filterCol, filterVal);
        const display_order = (existingCount ?? 0) + 1;

        const deptRes = await supabase
          .from("department_kpis")
          .insert({
            entity_id,
            kpi_definition_id: kpiDefinitionId,
            year: selected_year,
            display_order,
            org_department_id:       effectiveOrgDeptId ?? null,
            functional_department_id: effectiveFuncDeptId ?? null,
            corporate_kpi_id:        selectedCorpKpiId === "__none__" ? null : selectedCorpKpiId || null,
          })
          .select("id")
          .single();
        if (deptRes.error || !deptRes.data)
          throw new Error(deptRes.error?.message ?? "Failed to insert department KPI.");

        const targetRows = isBinary
          ? buildBinaryTargetRows("department_kpi_id", deptRes.data.id)
          : buildNumericTargetRows("department_kpi_id", deptRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase.from("department_kpi_targets").insert(targetRows as never);
          if (tRes.error) throw new Error(tRes.error.message);
        }

        if (effectiveOrgDeptId && effectiveFuncDeptId)
          syncFuncToLocalStorage(entity_id, effectiveOrgDeptId, effectiveFuncDeptId);
      } else {
        // individual
        const { count: existingCount } = await supabase
          .from("individual_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year)
          .eq("person_id", effectivePersonId as string);
        const display_order = (existingCount ?? 0) + 1;

        const indRes = await supabase
          .from("individual_kpis")
          .insert({
            entity_id,
            person_id: effectivePersonId as string,
            kpi_definition_id: kpiDefinitionId,
            year: selected_year,
            display_order,
            status: "draft",
            proposed_by: person.id,
            is_active: true,
          })
          .select("id")
          .single();
        if (indRes.error || !indRes.data)
          throw new Error(indRes.error?.message ?? "Failed to insert individual KPI.");

        const targetRows = isBinary
          ? buildBinaryTargetRows("individual_kpi_id", indRes.data.id)
          : buildNumericTargetRows("individual_kpi_id", indRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase.from("individual_kpi_targets").insert(targetRows as never);
          if (tRes.error) throw new Error(tRes.error.message);
        }
      }

      toast.success(`${LEVEL_LABEL[effectiveLevel]} KPI added.`);
      onSuccess();
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AddKpiModal] save failed", err);
      toast.error(`Failed to save KPI: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setValues(EMPTY);
    setTitleError(null);
    setInternalLevel("corporate");
    setSelectedOrgDeptId("");
    setSelectedPersonId("");
    setSelectedFuncDeptId("");
    setSelectedCorpKpiId("__none__");
  };

  const handleCancel = () => {
    if (saving) return;
    resetForm();
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit KPI" : `Add ${LEVEL_LABEL[effectiveLevel]} KPI`}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update the KPI details and targets." : "Define the KPI details and set targets by quarter."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Level selector */}
          {!levelProp && (
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select
                value={internalLevel}
                onValueChange={(v) => {
                  setInternalLevel(v as KpiLevel);
                  setSelectedOrgDeptId("");
                  setSelectedPersonId("");
                  setSelectedFuncDeptId("");
                  setSelectedCorpKpiId("__none__");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="individual">Individual Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Department picker */}
          {effectiveLevel === "department" && !orgDeptIdProp && !functional_department_id && (
            <div className="space-y-1.5">
              <Label>Department <span className="text-destructive">*</span></Label>
              <Select value={selectedOrgDeptId} onValueChange={setSelectedOrgDeptId}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {orgDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Function picker */}
          {effectiveLevel === "department" && !functional_department_id && (
            <div className="space-y-1.5">
              <Label>Function <span className="text-destructive">*</span></Label>
              <Select value={selectedFuncDeptId} onValueChange={setSelectedFuncDeptId}>
                <SelectTrigger><SelectValue placeholder="Select a function" /></SelectTrigger>
                <SelectContent>
                  {funcDepts.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Corporate KPI link — only for department KPIs */}
          {effectiveLevel === "department" && (
            <div className="space-y-1.5">
              <Label>Supports Corporate KPI</Label>
              <Select value={selectedCorpKpiId} onValueChange={setSelectedCorpKpiId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {corpKpisForLink.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Person picker */}
          {effectiveLevel === "individual" && !personIdProp && (
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-title">KPI Title <span className="text-destructive">*</span></Label>
            <Input
              id="kpi-title"
              value={values.title}
              onChange={(e) => { update("title", e.target.value); if (titleError) setTitleError(null); }}
              placeholder="e.g. Net Revenue Growth"
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-description">Description</Label>
            <Textarea
              id="kpi-description"
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional context about this KPI"
              rows={2}
            />
          </div>

          {/* KPI Type */}
          <div className="space-y-2">
            <Label>KPI Type</Label>
            <RadioGroup value={values.kpi_type} onValueChange={(v) => update("kpi_type", v as KpiType)} className="gap-2">
              {[
                { id: "type-progressive", value: "progressive", label: "Progressive", sub: "Tracked cumulatively by value" },
                { id: "type-binary",      value: "binary",      label: "Binary",      sub: "Achieved or not achieved"       },
                { id: "type-benchmark",   value: "benchmark",   label: "Benchmark",   sub: "Point-in-time score"            },
              ].map((t) => (
                <Label key={t.id} htmlFor={t.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
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
            <Label htmlFor="kpi-driver">Driver</Label>
            <Select value={values.driver} onValueChange={(v) => update("driver", v as KpiDriver)}>
              <SelectTrigger id="kpi-driver"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="culture">Culture</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-unit-preset">Unit</Label>
            <Select
              value={values.unitPreset}
              onValueChange={(v) => { update("unitPreset", v); update("unitCustom", ""); update("unitScoreOf", ""); }}
            >
              <SelectTrigger id="kpi-unit-preset"><SelectValue placeholder="Select unit (optional)" /></SelectTrigger>
              <SelectContent>
                {UNIT_PRESETS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {values.unitPreset === "score" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Score out of</span>
                <Input type="number" min={1} placeholder="e.g. 5" value={values.unitScoreOf} onChange={(e) => update("unitScoreOf", e.target.value)} className="w-24" />
              </div>
            )}
            {values.unitPreset === "custom" && (
              <Input placeholder="Enter unit label" value={values.unitCustom} onChange={(e) => update("unitCustom", e.target.value)} />
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
                      <Label htmlFor={`target-${f.key}`} className="text-xs">{f.label}</Label>
                      <Input
                        id={`target-${f.key}`}
                        type="number"
                        inputMode="decimal"
                        placeholder="—"
                        value={values.quarter_targets[f.key]}
                        onChange={(e) => setValues((v) => ({ ...v, quarter_targets: { ...v.quarter_targets, [f.key]: e.target.value } }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "H1 (Q1+Q2)", value: h1Computed },
                    { label: "H2 (Q3+Q4)", value: h2Computed },
                    { label: "Full Year",   value: fullYearComputed },
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
                  { id: "binary-h1",       field: "h1"       as BinaryTargetPeriod, label: "Achieved by H1?"        },
                  { id: "binary-fullyear", field: "fullyear" as BinaryTargetPeriod, label: "Achieved by Full Year?"  },
                ].map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border bg-background p-3">
                    <Label htmlFor={b.id} className="text-sm font-normal">{b.label}</Label>
                    <Switch
                      id={b.id}
                      checked={values.binary_targets[b.field]}
                      onCheckedChange={(checked) =>
                        setValues((v) => ({ ...v, binary_targets: { ...v.binary_targets, [b.field]: checked } }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditMode ? "Save Changes" : "Save KPI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
