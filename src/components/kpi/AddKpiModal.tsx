import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

import {
  type PeriodAggType,
  type ScoringType,
  type InputMode,
  derivePeriods,
  defaultsForAggType,
  inferLegacyKpiType,
  isDerivedPeriod,
  validatePeriodConsistency,
  PERIOD_AGG_META,
  SCORING_TYPE_META,
  INPUT_MODE_META,
} from "@/lib/kpi-engine";
import {
  isCalcModelSchemaMissing,
  omitCalcModelFields,
  MIGRATION_HINT,
} from "@/lib/kpi-save-compat";

export type KpiLevel = "corporate" | "department" | "individual";
/** @deprecated Use PeriodAggType + ScoringType from kpi-engine instead */
export type KpiType = "progressive" | "binary" | "benchmark";
export type KpiDriver = "growth" | "efficiency" | "culture";

export type QuarterPeriod = "q1" | "q2" | "q3" | "q4";
export type BinaryTargetPeriod = "h1" | "fullyear";

export type AddKpiFormValues = {
  title: string;
  description: string;
  period_agg_type: PeriodAggType;
  scoring_type: ScoringType;
  input_mode: InputMode;
  driver: KpiDriver;
  unitPreset: string;
  unitCustom: string;
  unitScoreOf: string;
  quarter_targets: Record<QuarterPeriod, string>;
  /** For snapshot/manual modes — all 7 period inputs */
  all_targets: Record<string, string>;
  binary_targets: Record<BinaryTargetPeriod, boolean>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level?: KpiLevel;
  onSuccess: () => void;
  org_department_id?: string | null;
  functional_department_id?: string | null;
  person_id?: string | null;
  editKpiDefId?: string | null;
  editBoardKpiId?: string | null;
  editBoardLevel?: "corporate" | "department" | null;
};

const LEVEL_LABEL: Record<KpiLevel, string> = {
  corporate: "Corporate",
  department: "Department",
  individual: "Individual",
};

const UNIT_PRESETS = [
  { value: "%",      label: "% (Percentage)" },
  { value: "EUR",    label: "EUR (Euros)"     },
  { value: "EUR M",  label: "EUR M (millions)"},
  { value: "Count",  label: "Count"           },
  { value: "score",  label: "Score out of…"  },
  { value: "custom", label: "Custom…"        },
];

const QUARTER_FIELDS: { key: QuarterPeriod; label: string }[] = [
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" },
];

const ALL_PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
const PERIOD_LABEL: Record<typeof ALL_PERIODS[number], string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

const EMPTY: AddKpiFormValues = {
  title: "",
  description: "",
  period_agg_type: "additive_flow",
  scoring_type: "higher_is_better",
  input_mode: "periodic",
  driver: "growth",
  unitPreset: "",
  unitCustom: "",
  unitScoreOf: "",
  quarter_targets: { q1: "", q2: "", q3: "", q4: "" },
  all_targets: { q1: "", q2: "", h1: "", q3: "", q4: "", h2: "", fullyear: "" },
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
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function reverseUnit(unit: string | null): {
  unitPreset: string;
  unitCustom: string;
  unitScoreOf: string;
} {
  if (!unit) return { unitPreset: "", unitCustom: "", unitScoreOf: "" };
  if (["%" , "EUR", "EUR M", "Count"].includes(unit))
    return { unitPreset: unit, unitCustom: "", unitScoreOf: "" };
  const m = unit.match(/^Score out of (\d+)$/);
  if (m) return { unitPreset: "score", unitCustom: "", unitScoreOf: m[1] };
  return { unitPreset: "custom", unitCustom: unit, unitScoreOf: "" };
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
  } catch { /* localStorage unavailable */ }
}

/** Info icon with tooltip — used next to field labels */
function FieldInfo({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="inline h-3.5 w-3.5 ml-1 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  const [consistencyErrors, setConsistencyErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [internalLevel, setInternalLevel] = useState<KpiLevel>("corporate");
  const [selectedOrgDeptId, setSelectedOrgDeptId] = useState<string>("");
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [selectedFuncDeptId, setSelectedFuncDeptId] = useState<string>("");
  const [orgDepts, setOrgDepts] = useState<{ id: string; name: string }[]>([]);
  const [funcDepts, setFuncDepts] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<
    { id: string; first_name: string; last_name: string }[]
  >([]);
  const [corpKpisForLink, setCorpKpisForLink] = useState<
    { id: string; title: string }[]
  >([]);
  const [selectedCorpKpiId, setSelectedCorpKpiId] = useState<string>("__none__");

  const effectiveLevel = levelProp ?? internalLevel;
  const effectiveOrgDeptId =
    orgDeptIdProp ?? (effectiveLevel === "department" ? selectedOrgDeptId || null : null);
  const effectivePersonId =
    personIdProp ?? (effectiveLevel === "individual" ? selectedPersonId || null : null);
  const effectiveFuncDeptId = functional_department_id ?? (selectedFuncDeptId || null);

  /* ── loaders ── */

  useEffect(() => {
    if (!open) return;
    supabase
      .from("functions")
      .select("id, name")
      .order("name")
      .then(({ data }) => setFuncDepts(data ?? []));
  }, [open]);

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
            title:
              (row.kpi_definitions as unknown as { title: string } | null)?.title ??
              "Untitled",
          })),
        );
      });
  }, [open, entity_id, selected_year, effectiveLevel]);

  /* ── pre-populate in edit mode ── */
  useEffect(() => {
    if (!open || !editKpiDefId) return;
    void (async () => {
      const { data: def } = await supabase
        .from("kpi_definitions")
        .select("title, description, kpi_type, driver, unit, period_agg_type, scoring_type, input_mode")
        .eq("id", editKpiDefId)
        .single();
      if (!def) return;

      const unitFields = reverseUnit(def.unit);

      // Default new fields from kpi_type if not yet migrated
      const aggType: PeriodAggType =
        (def.period_agg_type as PeriodAggType | null) ??
        (def.kpi_type === "binary"
          ? "milestone_state"
          : def.kpi_type === "benchmark"
            ? "snapshot_stock"
            : "additive_flow");
      const scoringType: ScoringType =
        (def.scoring_type as ScoringType | null) ??
        (def.kpi_type === "binary" ? "binary" : "higher_is_better");
      const inputMode: InputMode =
        (def.input_mode as InputMode | null) ??
        (def.kpi_type === "binary"
          ? "periodic"
          : def.kpi_type === "benchmark"
            ? "period_end_snapshot"
            : "periodic");

      let quarter_targets: Record<QuarterPeriod, string> = {
        q1: "", q2: "", q3: "", q4: "",
      };
      let all_targets: Record<string, string> = {
        q1: "", q2: "", h1: "", q3: "", q4: "", h2: "", fullyear: "",
      };
      let binary_targets: Record<BinaryTargetPeriod, boolean> = {
        h1: false, fullyear: false,
      };

      if (editBoardKpiId && editBoardLevel) {
        const tgtTable =
          editBoardLevel === "corporate"
            ? "corporate_kpi_targets"
            : "department_kpi_targets";
        const fkCol =
          editBoardLevel === "corporate" ? "corporate_kpi_id" : "department_kpi_id";
        const { data: tgts } = await supabase
          .from(tgtTable as "corporate_kpi_targets")
          .select("period, target_value, target_binary")
          .eq(fkCol as "corporate_kpi_id", editBoardKpiId);
        for (const t of tgts ?? []) {
          if (["q1", "q2", "q3", "q4"].includes(t.period))
            quarter_targets[t.period as QuarterPeriod] =
              t.target_value != null ? String(t.target_value) : "";
          all_targets[t.period] =
            t.target_value != null ? String(t.target_value) : "";
          if (t.period === "h1") binary_targets.h1 = t.target_binary ?? false;
          if (t.period === "fullyear") binary_targets.fullyear = t.target_binary ?? false;
        }

        if (editBoardLevel === "department") {
          const { data: deptRow } = await supabase
            .from("department_kpis")
            .select("corporate_kpi_id")
            .eq("id", editBoardKpiId)
            .single();
          setSelectedCorpKpiId(
            (deptRow as unknown as { corporate_kpi_id?: string | null } | null)
              ?.corporate_kpi_id ?? "__none__",
          );
        }
      }

      setValues({
        title: def.title,
        description: def.description ?? "",
        period_agg_type: aggType,
        scoring_type: scoringType,
        input_mode: inputMode,
        driver: def.driver as KpiDriver,
        ...unitFields,
        quarter_targets,
        all_targets,
        binary_targets,
      });
    })();
  }, [open, editKpiDefId, editBoardKpiId, editBoardLevel]);

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

  /* ── helpers ── */

  const update = <K extends keyof AddKpiFormValues>(
    key: K,
    value: AddKpiFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const isMilestone = values.period_agg_type === "milestone_state";
  const isSnapshot =
    values.period_agg_type === "snapshot_stock" ||
    values.input_mode === "period_end_snapshot" ||
    values.input_mode === "manual_aggregate";

  /* Quarter values for additive/average derivation */
  const q1 = parseNum(values.quarter_targets.q1);
  const q2 = parseNum(values.quarter_targets.q2);
  const q3 = parseNum(values.quarter_targets.q3);
  const q4 = parseNum(values.quarter_targets.q4);
  const derived = derivePeriods(q1, q2, q3, q4, values.period_agg_type);

  /* ── when agg type changes, update defaults ── */
  const handleAggTypeChange = (agg: PeriodAggType) => {
    const { scoringType, inputMode } = defaultsForAggType(agg);
    setValues((v) => ({
      ...v,
      period_agg_type: agg,
      scoring_type: scoringType,
      input_mode: inputMode,
    }));
  };

  /* ── build target rows ── */

  const buildNumericTargetRows = (fkName: string, fkValue: string) => {
    const rows: Record<string, unknown>[] = [];
    if (isSnapshot) {
      // All periods are user-entered
      for (const p of ALL_PERIODS) {
        const val = parseNum(values.all_targets[p] ?? "");
        if (val !== null) rows.push({ [fkName]: fkValue, period: p, target_value: val });
      }
    } else {
      // Periodic: quarters + derived H1/H2/FY
      const quarters: [QuarterPeriod, number | null][] = [
        ["q1", q1], ["q2", q2], ["q3", q3], ["q4", q4],
      ];
      for (const [period, val] of quarters) {
        if (val !== null) rows.push({ [fkName]: fkValue, period, target_value: val });
      }
      if (derived.h1 !== null)
        rows.push({ [fkName]: fkValue, period: "h1",       target_value: derived.h1 });
      if (derived.h2 !== null)
        rows.push({ [fkName]: fkValue, period: "h2",       target_value: derived.h2 });
      if (derived.fy !== null)
        rows.push({ [fkName]: fkValue, period: "fullyear", target_value: derived.fy });
    }
    return rows;
  };

  const buildBinaryTargetRows = (fkName: string, fkValue: string) => [
    { [fkName]: fkValue, period: "h1",       target_binary: values.binary_targets.h1       },
    { [fkName]: fkValue, period: "fullyear", target_binary: values.binary_targets.fullyear },
  ];

  /* ── save ── */

  const handleSave = async () => {
    if (!values.title.trim()) { setTitleError("KPI Title is required."); return; }
    setTitleError(null);

    // Consistency check for additive KPIs in snapshot mode where all periods entered
    if (!isSnapshot && !isMilestone) {
      const pMap: Record<string, number | null> = {
        q1, q2, q3, q4,
        h1: derived.h1,
        h2: derived.h2,
        fullyear: derived.fy,
      };
      const { errors } = validatePeriodConsistency(
        pMap as Record<string, number | null>,
        values.period_agg_type,
      );
      if (errors.length > 0) {
        setConsistencyErrors(errors);
        return;
      }
    }
    setConsistencyErrors([]);

    if (!entity_id)  return toast.error("No entity selected.");
    if (!person?.id) return toast.error("Cannot identify current user.");
    if (
      !isEditMode &&
      effectiveLevel === "department" &&
      !effectiveOrgDeptId &&
      !functional_department_id
    ) return toast.error("Please select a department.");
    if (!isEditMode && effectiveLevel === "department" && !effectiveFuncDeptId)
      return toast.error("Please select a function for this KPI.");
    if (effectiveLevel === "individual" && !effectivePersonId)
      return toast.error("Please select an employee.");

    setSaving(true);
    try {
      const unit      = deriveUnit(values.unitPreset, values.unitCustom, values.unitScoreOf);
      const legacyType = inferLegacyKpiType(values.period_agg_type, values.scoring_type);

      /* ── edit mode ── */
      if (isEditMode && editKpiDefId) {
        const updatePayload = {
          title:           values.title.trim(),
          description:     values.description.trim() || null,
          kpi_type:        legacyType,
          period_agg_type: values.period_agg_type,
          scoring_type:    values.scoring_type,
          input_mode:      values.input_mode,
          driver:          values.driver,
          unit,
        };
        let updRes = await supabase
          .from("kpi_definitions")
          .update(updatePayload)
          .eq("id", editKpiDefId);
        if (updRes.error) {
          if (isCalcModelSchemaMissing(updRes.error.message)) {
            updRes = await supabase
              .from("kpi_definitions")
              .update(omitCalcModelFields(updatePayload))
              .eq("id", editKpiDefId);
            if (!updRes.error) toast.warning(`Saved in compatibility mode. ${MIGRATION_HINT}`);
          }
          if (updRes.error) throw new Error(updRes.error.message);
        }

        if (editBoardKpiId && editBoardLevel) {
          const tgtTable =
            editBoardLevel === "corporate"
              ? "corporate_kpi_targets"
              : "department_kpi_targets";
          const fkCol =
            editBoardLevel === "corporate"
              ? "corporate_kpi_id"
              : "department_kpi_id";
          const targetRows = isMilestone
            ? buildBinaryTargetRows(fkCol, editBoardKpiId)
            : buildNumericTargetRows(fkCol, editBoardKpiId);
          if (targetRows.length > 0) {
            const upRes = await supabase
              .from(tgtTable as "corporate_kpi_targets")
              .upsert(targetRows as never, { onConflict: `${fkCol},period` });
            if (upRes.error) throw new Error(upRes.error.message);
          }

          if (editBoardLevel === "department") {
            await supabase
              .from("department_kpis")
              .update({
                corporate_kpi_id:
                  selectedCorpKpiId === "__none__" ? null : selectedCorpKpiId || null,
              })
              .eq("id", editBoardKpiId);
          }
        }

        toast.success("KPI updated.");
        onSuccess();
        resetForm();
        onOpenChange(false);
        return;
      }

      /* ── add mode ── */
      const insertPayload = {
        entity_id,
        title:           values.title.trim(),
        description:     values.description.trim() || null,
        kpi_type:        legacyType,
        period_agg_type: values.period_agg_type,
        scoring_type:    values.scoring_type,
        input_mode:      values.input_mode,
        driver:          values.driver,
        unit,
        year:            selected_year,
        is_active:       true,
        created_by:      person.id,
      };
      let defRes = await supabase
        .from("kpi_definitions")
        .insert(insertPayload)
        .select("id")
        .single();
      if (defRes.error) {
        if (isCalcModelSchemaMissing(defRes.error.message)) {
          defRes = await supabase
            .from("kpi_definitions")
            .insert(omitCalcModelFields(insertPayload))
            .select("id")
            .single();
          if (defRes.data && !defRes.error)
            toast.warning(`Saved in compatibility mode. ${MIGRATION_HINT}`);
        }
      }
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

        const targetRows = isMilestone
          ? buildBinaryTargetRows("corporate_kpi_id", corpRes.data.id)
          : buildNumericTargetRows("corporate_kpi_id", corpRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase.from("corporate_kpi_targets").insert(targetRows as never);
          if (tRes.error) throw new Error(tRes.error.message);
        }
      } else if (effectiveLevel === "department") {
        const filterCol = effectiveOrgDeptId
          ? "org_department_id"
          : "functional_department_id";
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
            kpi_definition_id:        kpiDefinitionId,
            year:                     selected_year,
            display_order,
            org_department_id:        effectiveOrgDeptId ?? null,
            functional_department_id: effectiveFuncDeptId ?? null,
            corporate_kpi_id:
              selectedCorpKpiId === "__none__" ? null : selectedCorpKpiId || null,
          })
          .select("id")
          .single();
        if (deptRes.error || !deptRes.data)
          throw new Error(deptRes.error?.message ?? "Failed to insert department KPI.");

        const targetRows = isMilestone
          ? buildBinaryTargetRows("department_kpi_id", deptRes.data.id)
          : buildNumericTargetRows("department_kpi_id", deptRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase
            .from("department_kpi_targets")
            .insert(targetRows as never);
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
            person_id:         effectivePersonId as string,
            kpi_definition_id: kpiDefinitionId,
            year:              selected_year,
            display_order,
            status:            "draft",
            proposed_by:       person.id,
            is_active:         true,
          })
          .select("id")
          .single();
        if (indRes.error || !indRes.data)
          throw new Error(indRes.error?.message ?? "Failed to insert individual KPI.");

        const targetRows = isMilestone
          ? buildBinaryTargetRows("individual_kpi_id", indRes.data.id)
          : buildNumericTargetRows("individual_kpi_id", indRes.data.id);
        if (targetRows.length > 0) {
          const tRes = await supabase
            .from("individual_kpi_targets")
            .insert(targetRows as never);
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
    setConsistencyErrors([]);
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
          <DialogTitle>
            {isEditMode ? "Edit KPI" : `Add ${LEVEL_LABEL[effectiveLevel]} KPI`}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the KPI details and targets."
              : "Define the KPI and set targets."}
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
              <Label>
                Department <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedOrgDeptId} onValueChange={setSelectedOrgDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {orgDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Function picker */}
          {effectiveLevel === "department" && !functional_department_id && (
            <div className="space-y-1.5">
              <Label>
                Function <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedFuncDeptId} onValueChange={setSelectedFuncDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a function" />
                </SelectTrigger>
                <SelectContent>
                  {funcDepts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Corporate KPI link */}
          {effectiveLevel === "department" && (
            <div className="space-y-1.5">
              <Label>Supports Corporate KPI</Label>
              <Select value={selectedCorpKpiId} onValueChange={setSelectedCorpKpiId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
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
              <Label>
                Employee <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-title">
              KPI Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="kpi-title"
              value={values.title}
              onChange={(e) => {
                update("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
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

          {/* ── Calculation model ── */}
          <div className="rounded-md border bg-muted/10 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Calculation Model
            </p>

            {/* Period Aggregation Type */}
            <div className="space-y-1.5">
              <Label htmlFor="kpi-agg-type">
                Period Aggregation
                <FieldInfo text={PERIOD_AGG_META[values.period_agg_type].description} />
              </Label>
              <Select
                value={values.period_agg_type}
                onValueChange={(v) => handleAggTypeChange(v as PeriodAggType)}
              >
                <SelectTrigger id="kpi-agg-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIOD_AGG_META) as PeriodAggType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PERIOD_AGG_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {PERIOD_AGG_META[values.period_agg_type].description}
              </p>
            </div>

            {/* Scoring Type */}
            <div className="space-y-1.5">
              <Label htmlFor="kpi-scoring-type">
                Scoring
                <FieldInfo text={SCORING_TYPE_META[values.scoring_type].description} />
              </Label>
              <Select
                value={values.scoring_type}
                onValueChange={(v) => update("scoring_type", v as ScoringType)}
              >
                <SelectTrigger id="kpi-scoring-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCORING_TYPE_META) as ScoringType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SCORING_TYPE_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {SCORING_TYPE_META[values.scoring_type].description}
              </p>
            </div>

            {/* Input Mode */}
            <div className="space-y-1.5">
              <Label htmlFor="kpi-input-mode">
                Input Mode
                <FieldInfo text={INPUT_MODE_META[values.input_mode].description} />
              </Label>
              <Select
                value={values.input_mode}
                onValueChange={(v) => update("input_mode", v as InputMode)}
              >
                <SelectTrigger id="kpi-input-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(INPUT_MODE_META) as InputMode[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {INPUT_MODE_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Driver */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-driver">Driver</Label>
            <Select
              value={values.driver}
              onValueChange={(v) => update("driver", v as KpiDriver)}
            >
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
              onValueChange={(v) => {
                update("unitPreset", v);
                update("unitCustom", "");
                update("unitScoreOf", "");
              }}
            >
              <SelectTrigger id="kpi-unit-preset">
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
                  type="number"
                  min={1}
                  placeholder="e.g. 5"
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

          {/* ── Targets ── */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Targets</Label>
              <p className="text-xs text-muted-foreground">
                {isMilestone
                  ? "Set whether the milestone should be achieved by H1 and/or by year-end."
                  : isSnapshot
                    ? "Enter each period independently — periods do not aggregate."
                    : "Enter quarterly targets — H1, H2, and Full Year are derived automatically."}
              </p>
            </div>

            {/* ── Milestone / Binary ── */}
            {isMilestone && (
              <div className="space-y-3">
                {(
                  [
                    { id: "binary-h1",       field: "h1"       as BinaryTargetPeriod, label: "Achieved by H1?"       },
                    { id: "binary-fullyear", field: "fullyear" as BinaryTargetPeriod, label: "Achieved by Full Year?" },
                  ] as const
                ).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border bg-background p-3"
                  >
                    <Label htmlFor={b.id} className="text-sm font-normal">
                      {b.label}
                    </Label>
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

            {/* ── Snapshot / all-period mode ── */}
            {!isMilestone && isSnapshot && (
              <div className="grid grid-cols-4 gap-2">
                {ALL_PERIODS.map((p) => (
                  <div key={p} className="space-y-1">
                    <Label className="text-xs">{PERIOD_LABEL[p]}</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="—"
                      value={values.all_targets[p] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          all_targets: { ...v.all_targets, [p]: e.target.value },
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── Periodic (additive / average) ── */}
            {!isMilestone && !isSnapshot && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {QUARTER_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`target-${f.key}`} className="text-xs">
                        {f.label}
                      </Label>
                      <Input
                        id={`target-${f.key}`}
                        type="number"
                        inputMode="decimal"
                        placeholder="—"
                        value={values.quarter_targets[f.key]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            quarter_targets: {
                              ...v.quarter_targets,
                              [f.key]: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { label: "H1",        value: derived.h1 },
                      { label: "H2",        value: derived.h2 },
                      { label: "Full Year", value: derived.fy  },
                    ] as const
                  ).map(({ label, value }) => (
                    <div key={label} className="rounded-md border bg-background p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className="text-sm font-medium text-muted-foreground">
                        {value !== null ? value : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Consistency errors */}
            {consistencyErrors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-2 space-y-1">
                {consistencyErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isEditMode ? "Save Changes" : "Save KPI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
