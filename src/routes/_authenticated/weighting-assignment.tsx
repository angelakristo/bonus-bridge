import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/weighting-assignment")({
  component: WeightingAssignmentPage,
});

type EmployeeOption = {
  id: string;
  full_name: string;
};

type KpiLevel = "corporate" | "department" | "individual";

type ItemRow = {
  kpi_assignment_id: string;
  title: string;
  driver: "growth" | "efficiency" | "culture";
};

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth: { bg: "bg-green-100", text: "text-green-800", label: "Growth" },
  efficiency: { bg: "bg-blue-100", text: "text-blue-800", label: "Efficiency" },
  culture: { bg: "bg-amber-100", text: "text-amber-800", label: "Culture" },
};

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

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
    sum === 100
      ? "text-green-600"
      : sum > 100
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("text-sm font-medium", color)}>
      {sum}% of 100%
    </span>
  );
}

function WeightingAssignmentPage() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const isCeo = roles.includes("ceo");
  const isManager = roles.includes("manager");
  const allowed = isCeo || isManager;

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Group weights
  const [corpPct, setCorpPct] = useState(0);
  const [deptPct, setDeptPct] = useState(0);
  const [indPct, setIndPct] = useState(0);

  // Items
  const [corpItems, setCorpItems] = useState<ItemRow[]>([]);
  const [deptItems, setDeptItems] = useState<ItemRow[]>([]);
  const [indItems, setIndItems] = useState<ItemRow[]>([]);

  // Item weights keyed by `${level}:${kpi_assignment_id}`
  const [itemWeights, setItemWeights] = useState<Record<string, number>>({});

  // Load employees list scoped by role
  useEffect(() => {
    if (!allowed || !entity_id || !person?.id) return;
    let cancelled = false;
    (async () => {
      setEmployeesLoading(true);

      let personIds: string[] | null = null;
      if (!isCeo) {
        const { data: myDepts } = await supabase
          .from("people_org_departments")
          .select("org_department_id")
          .eq("person_id", person.id);
        const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
        if (deptIds.length === 0) {
          if (!cancelled) {
            setEmployees([]);
            setEmployeesLoading(false);
          }
          return;
        }
        const { data: peers } = await supabase
          .from("people_org_departments")
          .select("person_id")
          .in("org_department_id", deptIds);
        personIds = Array.from(
          new Set((peers ?? []).map((p) => p.person_id)),
        );
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
        console.error("[Weighting] load employees failed", error);
        toast.error("Failed to load employees.");
        setEmployees([]);
      } else {
        setEmployees(
          (data ?? []).map((p) => ({
            id: p.id,
            full_name: `${p.first_name} ${p.last_name}`,
          })),
        );
      }
      setEmployeesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, entity_id, person?.id, isCeo]);

  const loadEmployeeData = useCallback(async () => {
    if (!entity_id || !selectedPersonId) return;
    setLoading(true);

    // 1. Group weights
    const groupReq = supabase
      .from("employee_kpi_group_weights")
      .select(
        "corporate_weight_pct, department_weight_pct, individual_weight_pct",
      )
      .eq("entity_id", entity_id)
      .eq("person_id", selectedPersonId)
      .eq("year", selected_year)
      .maybeSingle();

    // 2. Corporate items
    const corpReq = supabase
      .from("corporate_kpis")
      .select("id, kpi_definitions(title, driver)")
      .eq("entity_id", entity_id)
      .eq("year", selected_year);

    // 3. Department items - find departments employee belongs to
    const orgDeptReq = supabase
      .from("people_org_departments")
      .select("org_department_id")
      .eq("person_id", selectedPersonId);
    const funcDeptReq = supabase
      .from("people_functional_departments")
      .select("functional_department_id")
      .eq("person_id", selectedPersonId);

    // 4. Individual items - approved only
    const indReq = supabase
      .from("individual_kpis")
      .select("id, kpi_definitions(title, driver)")
      .eq("entity_id", entity_id)
      .eq("person_id", selectedPersonId)
      .eq("year", selected_year)
      .eq("is_active", true)
      .eq("status", "approved");

    // 5. Existing item weights
    const itemWeightsReq = supabase
      .from("employee_kpi_item_weights")
      .select("kpi_assignment_id, kpi_level, weight_pct")
      .eq("entity_id", entity_id)
      .eq("person_id", selectedPersonId)
      .eq("year", selected_year);

    const [
      groupRes,
      corpRes,
      orgDeptRes,
      funcDeptRes,
      indRes,
      itemWeightsRes,
    ] = await Promise.all([
      groupReq,
      corpReq,
      orgDeptReq,
      funcDeptReq,
      indReq,
      itemWeightsReq,
    ]);

    // Group weights state
    if (groupRes.data) {
      setCorpPct(Number(groupRes.data.corporate_weight_pct) || 0);
      setDeptPct(Number(groupRes.data.department_weight_pct) || 0);
      setIndPct(Number(groupRes.data.individual_weight_pct) || 0);
    } else {
      setCorpPct(0);
      setDeptPct(0);
      setIndPct(0);
    }

    const mapItems = (
      rows: Array<{ id: string; kpi_definitions: unknown }> | null,
    ): ItemRow[] =>
      (rows ?? []).map((r) => {
        const def = r.kpi_definitions as {
          title: string;
          driver: ItemRow["driver"];
        } | null;
        return {
          kpi_assignment_id: r.id,
          title: def?.title ?? "Untitled KPI",
          driver: def?.driver ?? "growth",
        };
      });

    setCorpItems(mapItems(corpRes.data));
    setIndItems(mapItems(indRes.data));

    // Department items: filter department_kpis by employee's depts
    const orgDeptIds = (orgDeptRes.data ?? []).map((d) => d.org_department_id);
    const funcDeptIds = (funcDeptRes.data ?? []).map(
      (d) => d.functional_department_id,
    );

    let deptRows: ItemRow[] = [];
    if (orgDeptIds.length > 0 || funcDeptIds.length > 0) {
      const { data: dData, error: dErr } = await supabase
        .from("department_kpis")
        .select(
          "id, org_department_id, functional_department_id, kpi_definitions(title, driver)",
        )
        .eq("entity_id", entity_id)
        .eq("year", selected_year);
      if (dErr) {
        console.error("[Weighting] department_kpis failed", dErr);
      } else {
        const filtered = (dData ?? []).filter((r) => {
          const inOrg =
            r.org_department_id && orgDeptIds.includes(r.org_department_id);
          const inFunc =
            r.functional_department_id &&
            funcDeptIds.includes(r.functional_department_id);
          return inOrg || inFunc;
        });
        deptRows = mapItems(filtered);
      }
    }
    setDeptItems(deptRows);

    // Existing item weights
    const map: Record<string, number> = {};
    for (const r of itemWeightsRes.data ?? []) {
      map[`${r.kpi_level}:${r.kpi_assignment_id}`] = Number(r.weight_pct) || 0;
    }
    setItemWeights(map);

    setLoading(false);
  }, [entity_id, selectedPersonId, selected_year]);

  useEffect(() => {
    if (selectedPersonId) {
      void loadEmployeeData();
    }
  }, [selectedPersonId, loadEmployeeData]);

  const getWeight = (level: KpiLevel, id: string) =>
    itemWeights[`${level}:${id}`] ?? 0;
  const setWeight = (level: KpiLevel, id: string, n: number) =>
    setItemWeights((prev) => ({ ...prev, [`${level}:${id}`]: n }));

  const groupTotal = corpPct + deptPct + indPct;

  const sumItems = (level: KpiLevel, items: ItemRow[]) =>
    items.reduce((acc, it) => acc + getWeight(level, it.kpi_assignment_id), 0);

  const corpSubtotal = useMemo(
    () => sumItems("corporate", corpItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corpItems, itemWeights],
  );
  const deptSubtotal = useMemo(
    () => sumItems("department", deptItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deptItems, itemWeights],
  );
  const indSubtotal = useMemo(
    () => sumItems("individual", indItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indItems, itemWeights],
  );

  const groupValid = groupTotal === 100;
  const corpValid = corpItems.length === 0 || corpSubtotal === 100;
  const deptValid = deptItems.length === 0 || deptSubtotal === 100;
  const indValid = indItems.length === 0 || indSubtotal === 100;
  const allValid = groupValid && corpValid && deptValid && indValid;

  const selectedEmployeeName =
    employees.find((e) => e.id === selectedPersonId)?.full_name ?? "employee";

  const handleSave = async () => {
    if (!entity_id || !selectedPersonId || !allValid) return;

    setSaving(true);

    const { error: groupErr } = await supabase
      .from("employee_kpi_group_weights")
      .upsert(
        {
          entity_id,
          person_id: selectedPersonId,
          year: selected_year,
          corporate_weight_pct: corpPct,
          department_weight_pct: deptPct,
          individual_weight_pct: indPct,
        },
        { onConflict: "person_id,entity_id,year" },
      );

    if (groupErr) {
      console.error("[Weighting] upsert group failed", groupErr);
      toast.error("Failed to save group weights.");
      setSaving(false);
      return;
    }

    type Insert = {
      entity_id: string;
      person_id: string;
      year: number;
      kpi_level: KpiLevel;
      kpi_assignment_id: string;
      weight_pct: number;
    };
    const inserts: Insert[] = [];
    const pushAll = (level: KpiLevel, items: ItemRow[]) => {
      for (const it of items) {
        inserts.push({
          entity_id,
          person_id: selectedPersonId,
          year: selected_year,
          kpi_level: level,
          kpi_assignment_id: it.kpi_assignment_id,
          weight_pct: getWeight(level, it.kpi_assignment_id),
        });
      }
    };
    pushAll("corporate", corpItems);
    pushAll("department", deptItems);
    pushAll("individual", indItems);

    if (inserts.length > 0) {
      const { error: upErr } = await supabase
        .from("employee_kpi_item_weights")
        .upsert(inserts, {
          onConflict: "person_id,entity_id,year,kpi_level,kpi_assignment_id",
        });
      if (upErr) {
        console.error("[Weighting] upsert item weights failed", upErr);
        toast.error("Failed to save item weights.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(`Weightings saved for ${selectedEmployeeName}.`);
  };

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderItemPanel = (
    title: string,
    level: KpiLevel,
    items: ItemRow[],
    subtotal: number,
  ) => {
    const showError = items.length > 0 && subtotal !== 100;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
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
                      <span className="truncate text-sm font-medium">
                        {it.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("border-0", ds.bg, ds.text)}
                      >
                        {ds.label}
                      </Badge>
                    </div>
                    <WeightInput
                      ariaLabel={`Weight for ${it.title}`}
                      value={getWeight(level, it.kpi_assignment_id)}
                      onChange={(n) =>
                        setWeight(level, it.kpi_assignment_id, n)
                      }
                    />
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Subtotal
                </span>
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Weighting Assignment
          </h1>
          <p className="text-sm text-muted-foreground">
            Assign KPI group and item weights for an employee.
          </p>
        </div>
        <Badge variant="secondary">Year: {selected_year}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <Label className="text-sm">Select employee</Label>
            <Select
              value={selectedPersonId ?? undefined}
              onValueChange={(v) => setSelectedPersonId(v)}
              disabled={employeesLoading}
            >
              <SelectTrigger className="mt-1">
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
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedPersonId && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Section 1 — Group Weights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label className="text-sm">Corporate KPIs %</Label>
                      <div className="mt-1">
                        <WeightInput
                          ariaLabel="Corporate group weight"
                          value={corpPct}
                          onChange={setCorpPct}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Department KPIs %</Label>
                      <div className="mt-1">
                        <WeightInput
                          ariaLabel="Department group weight"
                          value={deptPct}
                          onChange={setDeptPct}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Individual KPIs %</Label>
                      <div className="mt-1">
                        <WeightInput
                          ariaLabel="Individual group weight"
                          value={indPct}
                          onChange={setIndPct}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Total
                    </span>
                    <SubtotalLabel sum={groupTotal} />
                  </div>
                  {!groupValid && (
                    <p className="mt-2 text-sm text-destructive">
                      Group weights must sum to 100%. Current total:{" "}
                      {groupTotal}%.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div>
                <h2 className="mb-2 text-base font-semibold">
                  Section 2 — Item Weights
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {renderItemPanel(
                    "Corporate KPIs",
                    "corporate",
                    corpItems,
                    corpSubtotal,
                  )}
                  {renderItemPanel(
                    "Department KPIs",
                    "department",
                    deptItems,
                    deptSubtotal,
                  )}
                  {renderItemPanel(
                    "Individual KPIs",
                    "individual",
                    indItems,
                    indSubtotal,
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving || !allValid}>
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
    </div>
  );
}
