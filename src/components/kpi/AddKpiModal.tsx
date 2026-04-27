import { useState } from "react";
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
  level: KpiLevel;
  onSuccess: () => void;
  /** Required when level === "department" */
  org_department_id?: string | null;
  /** Required when level === "department" */
  functional_department_id?: string | null;
  /** Required when level === "individual" */
  person_id?: string | null;
};

const LEVEL_LABEL: Record<KpiLevel, string> = {
  corporate: "Corporate",
  department: "Department",
  individual: "Individual",
};

const UNIT_PRESETS = [
  { value: "%", label: "% (Percentage)" },
  { value: "EUR", label: "EUR (Euros)" },
  { value: "Count", label: "Count" },
  { value: "score", label: "Score out of..." },
  { value: "custom", label: "Custom..." },
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

export function AddKpiModal({
  open,
  onOpenChange,
  level,
  onSuccess,
  org_department_id = null,
  functional_department_id = null,
  person_id: target_person_id = null,
}: Props) {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const [values, setValues] = useState<AddKpiFormValues>(EMPTY);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof AddKpiFormValues>(
    key: K,
    value: AddKpiFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  // Derived computed targets for progressive/benchmark KPIs
  const q1 = parseNum(values.quarter_targets.q1);
  const q2 = parseNum(values.quarter_targets.q2);
  const q3 = parseNum(values.quarter_targets.q3);
  const q4 = parseNum(values.quarter_targets.q4);
  const h1Computed = q1 !== null && q2 !== null ? q1 + q2 : null;
  const h2Computed = q3 !== null && q4 !== null ? q3 + q4 : null;
  const fullYearComputed =
    h1Computed !== null && h2Computed !== null ? h1Computed + h2Computed : null;

  const buildNumericTargetRows = (fkName: string, fkValue: string) => {
    const rows: Record<string, unknown>[] = [];
    const quarters: [QuarterPeriod, number | null][] = [
      ["q1", q1],
      ["q2", q2],
      ["q3", q3],
      ["q4", q4],
    ];
    for (const [period, val] of quarters) {
      if (val !== null) rows.push({ [fkName]: fkValue, period, target_value: val });
    }
    if (h1Computed !== null)
      rows.push({ [fkName]: fkValue, period: "h1", target_value: h1Computed });
    if (h2Computed !== null)
      rows.push({ [fkName]: fkValue, period: "h2", target_value: h2Computed });
    if (fullYearComputed !== null)
      rows.push({ [fkName]: fkValue, period: "fullyear", target_value: fullYearComputed });
    return rows;
  };

  const buildBinaryTargetRows = (fkName: string, fkValue: string) => [
    { [fkName]: fkValue, period: "h1", target_binary: values.binary_targets.h1 },
    { [fkName]: fkValue, period: "fullyear", target_binary: values.binary_targets.fullyear },
  ];

  const handleSave = async () => {
    if (!values.title.trim()) {
      setTitleError("KPI Title is required.");
      return;
    }
    setTitleError(null);

    if (!entity_id) return toast.error("No entity selected.");
    if (!person?.id) return toast.error("Cannot identify current user.");
    if (level === "department" && !org_department_id && !functional_department_id) {
      return toast.error("Department context is required.");
    }
    if (level === "individual" && !target_person_id) {
      return toast.error("Person context is required.");
    }

    setSaving(true);
    try {
      const unit = deriveUnit(values.unitPreset, values.unitCustom, values.unitScoreOf);

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
      if (defRes.error || !defRes.data) {
        throw new Error(defRes.error?.message ?? "Failed to insert KPI definition.");
      }
      const kpiDefinitionId = defRes.data.id;
      const isBinary = values.kpi_type === "binary";

      if (level === "corporate") {
        const countRes = await supabase
          .from("corporate_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year);
        if (countRes.error) throw new Error(countRes.error.message);
        const display_order = (countRes.count ?? 0) + 1;

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
      } else if (level === "department") {
        const filterCol = org_department_id ? "org_department_id" : "functional_department_id";
        const filterVal = (org_department_id ?? functional_department_id) as string;
        const countRes = await supabase
          .from("department_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year)
          .eq(filterCol, filterVal);
        if (countRes.error) throw new Error(countRes.error.message);
        const display_order = (countRes.count ?? 0) + 1;

        const deptRes = await supabase
          .from("department_kpis")
          .insert({
            entity_id,
            kpi_definition_id: kpiDefinitionId,
            year: selected_year,
            display_order,
            org_department_id: org_department_id ?? null,
            functional_department_id: functional_department_id ?? null,
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
      } else {
        const countRes = await supabase
          .from("individual_kpis")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entity_id)
          .eq("year", selected_year)
          .eq("person_id", target_person_id as string);
        if (countRes.error) throw new Error(countRes.error.message);
        const display_order = (countRes.count ?? 0) + 1;

        const indRes = await supabase
          .from("individual_kpis")
          .insert({
            entity_id,
            person_id: target_person_id as string,
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

      toast.success(`${LEVEL_LABEL[level]} KPI added.`);
      onSuccess();
      setValues(EMPTY);
      setTitleError(null);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AddKpiModal] save failed", err);
      toast.error(`Failed to save KPI: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // Only reset form on explicit cancel — not on every close — so state survives tab switches.
  const handleCancel = () => {
    if (saving) return;
    setValues(EMPTY);
    setTitleError(null);
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
          <DialogTitle>Add {LEVEL_LABEL[level]} KPI</DialogTitle>
          <DialogDescription>
            Define the KPI details and set targets by quarter.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
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

          {/* KPI Type */}
          <div className="space-y-2">
            <Label>KPI Type</Label>
            <RadioGroup
              value={values.kpi_type}
              onValueChange={(v) => update("kpi_type", v as KpiType)}
              className="gap-2"
            >
              <Label
                htmlFor="type-progressive"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-progressive" value="progressive" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Progressive</span>
                  <span className="block text-xs text-muted-foreground">
                    Tracked cumulatively by value
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="type-binary"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-binary" value="binary" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Binary</span>
                  <span className="block text-xs text-muted-foreground">
                    Achieved or not achieved
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="type-benchmark"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-benchmark" value="benchmark" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Benchmark</span>
                  <span className="block text-xs text-muted-foreground">
                    Point-in-time score
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </div>

          {/* Driver */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-driver">Driver</Label>
            <Select
              value={values.driver}
              onValueChange={(v) => update("driver", v as KpiDriver)}
            >
              <SelectTrigger id="kpi-driver">
                <SelectValue />
              </SelectTrigger>
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
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
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

            {values.unitPreset && values.unitPreset !== "score" && values.unitPreset !== "custom" && (
              <p className="text-xs text-muted-foreground">
                Stored as: <span className="font-medium">{values.unitPreset}</span>
              </p>
            )}
            {values.unitPreset === "score" && values.unitScoreOf && (
              <p className="text-xs text-muted-foreground">
                Stored as: <span className="font-medium">Score out of {values.unitScoreOf}</span>
              </p>
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
                {/* Editable quarters */}
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

                {/* Auto-calculated summaries */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "H1 (Q1+Q2)", value: h1Computed },
                    { label: "H2 (Q3+Q4)", value: h2Computed },
                    { label: "Full Year", value: fullYearComputed },
                  ].map(({ label, value }) => (
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

            {values.kpi_type === "binary" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border bg-background p-3">
                  <Label htmlFor="binary-h1" className="text-sm font-normal">
                    Achieved by H1?
                  </Label>
                  <Switch
                    id="binary-h1"
                    checked={values.binary_targets.h1}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({
                        ...v,
                        binary_targets: { ...v.binary_targets, h1: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background p-3">
                  <Label htmlFor="binary-fullyear" className="text-sm font-normal">
                    Achieved by Full Year?
                  </Label>
                  <Switch
                    id="binary-fullyear"
                    checked={values.binary_targets.fullyear}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({
                        ...v,
                        binary_targets: { ...v.binary_targets, fullyear: checked },
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save KPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
