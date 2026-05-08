import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  calcAchievementPct,
  fmtAchievement,
  isDerivedPeriod,
  deriveSinglePeriod,
  VALUE_STYLE,
  PERIOD_AGG_META,
  SCORING_TYPE_META,
  type PeriodAggType,
  type ScoringType,
  type InputMode,
  type Period as EngPeriod,
} from "@/lib/kpi-engine";

export const Route = createFileRoute("/_authenticated/actuals-upload")({
  component: ActualsUploadPage,
});

/* ── Constants ─────────────────────────────────────────────────────────────── */

const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth:     { bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-800 dark:text-green-300",  label: "Growth"     },
  efficiency: { bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-800 dark:text-blue-300",    label: "Efficiency" },
  culture:    { bg: "bg-amber-100 dark:bg-amber-900/30",  text: "text-amber-800 dark:text-amber-300",  label: "Culture"    },
};

const TYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  progressive: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", label: "Progressive" },
  binary:      { bg: "bg-rose-100 dark:bg-rose-900/30",     text: "text-rose-800 dark:text-rose-300",     label: "Binary"      },
  benchmark:   { bg: "bg-sky-100 dark:bg-sky-900/30",       text: "text-sky-800 dark:text-sky-300",       label: "Benchmark"   },
};

const LEVEL_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  corporate:  { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-800 dark:text-indigo-300", label: "Corporate"  },
  department: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", label: "Department" },
  individual: { bg: "bg-teal-100 dark:bg-teal-900/30",     text: "text-teal-800 dark:text-teal-300",     label: "Individual" },
};

/* ── Types ─────────────────────────────────────────────────────────────────── */

type FilterTab = "all" | "corporate" | "department" | "individual";

type OrgDept   = { id: string; name: string };
type Employee  = { id: string; name: string };

type PeriodTarget = { target_value: number | null; target_binary: boolean | null };

type KpiRow = {
  board_kpi_id: string;
  kpi_definition_id: string;
  title: string;
  description: string | null;
  driver: "growth" | "efficiency" | "culture";
  kpi_type: "progressive" | "binary" | "benchmark";
  period_agg_type: PeriodAggType | null;
  scoring_type: ScoringType | null;
  input_mode: InputMode | null;
  unit: string | null;
  related_kpi: string | null;
  period_targets: Record<string, PeriodTarget>;
  kpi_level: "corporate" | "department" | "individual";
};

type ActualEntry  = { value: string; binary: boolean | null; dirty: boolean };
type PeriodActualsMap = Record<string, ActualEntry>;
type KpiActualsMap    = Record<string, PeriodActualsMap>; // board_kpi_id -> period -> entry

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function isBinaryKpi(kpi: KpiRow): boolean {
  return kpi.scoring_type === "binary" || (kpi.scoring_type == null && kpi.kpi_type === "binary");
}

function formatTarget(kpi: KpiRow, target: PeriodTarget | undefined): string {
  if (!target) return "—";
  if (isBinaryKpi(kpi)) {
    return target.target_binary === true ? "Yes" : target.target_binary === false ? "No" : "—";
  }
  return target.target_value !== null ? String(target.target_value) : "—";
}

/**
 * Return the effective actual value for a period, computing derived periods
 * (H1/H2/FY) from quarterly entries for additive KPI types.
 */
function effectiveActualValue(
  periodData: PeriodActualsMap,
  period: Period,
  aggType: PeriodAggType | null,
): number | null {
  if (isDerivedPeriod(period as EngPeriod, aggType)) {
    return deriveSinglePeriod(
      Object.fromEntries(
        Object.entries(periodData).map(([p, e]) => [
          p,
          { target_value: e.value !== "" ? (Number(e.value) || null) : null, target_binary: e.binary },
        ]),
      ),
      period as "h1" | "h2" | "fullyear",
      aggType,
    );
  }
  const v = periodData[period]?.value;
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmtAchieved(kpi: KpiRow, target: PeriodTarget | undefined, periodData: PeriodActualsMap, period: Period): string {
  if (!target) return "—";
  const av = effectiveActualValue(periodData, period, kpi.period_agg_type);
  const ab = periodData[period]?.binary ?? null;
  const pct = calcAchievementPct(
    av,
    ab,
    target.target_value ?? null,
    target.target_binary ?? null,
    kpi.scoring_type,
    kpi.kpi_type,
  );
  return fmtAchievement(pct);
}

/** Short badge label for KPI type — new model when available, legacy fallback. */
function kpiTypeLabel(kpi: KpiRow): string {
  if (kpi.period_agg_type) return PERIOD_AGG_META[kpi.period_agg_type].shortLabel;
  return kpi.kpi_type === "progressive" ? "Progressive" : kpi.kpi_type === "binary" ? "Binary" : "Benchmark";
}

/* ── KpiPanel ──────────────────────────────────────────────────────────────── */

type KpiPanelProps = {
  kpi: KpiRow;
  actuals: PeriodActualsMap;
  saving: boolean;
  onUpdateValue: (period: string, value: string) => void;
  onUpdateBinary: (period: string, binary: boolean | null) => void;
  onSave: () => void;
};

function KpiPanel({ kpi, actuals, saving, onUpdateValue, onUpdateBinary, onSave }: KpiPanelProps) {
  const ds = DRIVER_STYLE[kpi.driver] ?? DRIVER_STYLE.growth;
  const ts = TYPE_STYLE[kpi.kpi_type]  ?? TYPE_STYLE.progressive;
  const ls = LEVEL_STYLE[kpi.kpi_level] ?? LEVEL_STYLE.corporate;
  const isBinary  = isBinaryKpi(kpi);
  const hasDirty  = Object.values(actuals).some((a) => a.dirty);
  const BINARY_EDITABLE = new Set<Period>(["h1", "fullyear"]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge variant="outline" className={cn("border-0 text-xs font-medium", ls.bg, ls.text)}>
                {ls.label}
              </Badge>
              <Badge variant="outline" className={cn("border-0 text-xs font-medium", ds.bg, ds.text)}>
                {ds.label}
              </Badge>
              <Badge variant="outline" className={cn("border-0 text-xs font-medium", ts.bg, ts.text)}>
                {kpiTypeLabel(kpi)}
              </Badge>
              {kpi.scoring_type && (
                <span className="text-xs text-muted-foreground">
                  · {SCORING_TYPE_META[kpi.scoring_type].label}
                </span>
              )}
              {kpi.unit && (
                <span className="text-xs text-muted-foreground">· {kpi.unit}</span>
              )}
            </div>
            <CardTitle className="text-sm font-semibold leading-snug">{kpi.title}</CardTitle>
            {kpi.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{kpi.description}</p>
            )}
            {kpi.related_kpi && (
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium">Linked to:</span> {kpi.related_kpi}
              </p>
            )}
          </div>
          <Button size="sm" disabled={saving || !hasDirty} onClick={onSave}>
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 text-xs">Metric</TableHead>
              {PERIODS.map((p) => (
                <TableHead key={p} className="text-xs text-center min-w-[72px]">
                  {PERIOD_LABEL[p]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Row 1 — Targets (read-only) */}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell className="text-xs font-medium text-muted-foreground py-2">Target</TableCell>
              {PERIODS.map((p) => (
                <TableCell key={p} className="text-xs text-center py-2">
                  {formatTarget(kpi, kpi.period_targets[p])}
                </TableCell>
              ))}
            </TableRow>

            {/* Row 2 — Actuals (editable; derived periods show computed value) */}
            <TableRow>
              <TableCell className="text-xs font-medium py-1">Actuals</TableCell>
              {PERIODS.map((p) => {
                const isKpiDerived = isDerivedPeriod(p as EngPeriod, kpi.period_agg_type);

                if (isBinary) {
                  if (!BINARY_EDITABLE.has(p)) {
                    return (
                      <TableCell key={p} className="text-xs text-center py-2 text-muted-foreground">—</TableCell>
                    );
                  }
                  return (
                    <TableCell key={p} className="p-1">
                      <Select
                        value={
                          actuals[p]?.binary === true
                            ? "yes"
                            : actuals[p]?.binary === false
                              ? "no"
                              : "__none__"
                        }
                        onValueChange={(v) =>
                          onUpdateBinary(p, v === "yes" ? true : v === "no" ? false : null)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  );
                }

                if (isKpiDerived) {
                  const dv = effectiveActualValue(actuals, p, kpi.period_agg_type);
                  const style = dv !== null ? VALUE_STYLE.calculated : VALUE_STYLE.none;
                  return (
                    <TableCell key={p} className="text-xs text-center py-2">
                      <span className={cn("italic tabular-nums", style)}>
                        {dv !== null ? dv : "—"}
                      </span>
                    </TableCell>
                  );
                }

                const hasValue = actuals[p]?.value !== "" && actuals[p]?.value != null;
                return (
                  <TableCell key={p} className="p-1">
                    <Input
                      type="number"
                      className={cn(
                        "h-7 text-xs text-center",
                        hasValue && VALUE_STYLE.user_entered,
                      )}
                      value={actuals[p]?.value ?? ""}
                      onChange={(e) => onUpdateValue(p, e.target.value)}
                      placeholder="—"
                    />
                  </TableCell>
                );
              })}
            </TableRow>

            {/* Row 3 — % Achieved (computed) */}
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableCell className="text-xs font-medium text-muted-foreground py-2">% Achieved</TableCell>
              {PERIODS.map((p) => (
                <TableCell key={p} className="text-xs text-center py-2 tabular-nums">
                  {fmtAchieved(kpi, kpi.period_targets[p], actuals, p)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

function ActualsUploadPage() {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const [filter, setFilter]               = useState<FilterTab>("all");
  const [orgDepts, setOrgDepts]           = useState<OrgDept[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [employees, setEmployees]         = useState<Employee[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [kpis, setKpis]                   = useState<KpiRow[]>([]);
  const [loading, setLoading]             = useState(false);
  const [actualsMap, setActualsMap]       = useState<KpiActualsMap>({});
  const [savingSet, setSavingSet]         = useState<Set<string>>(new Set());

  /* Load org departments once */
  useEffect(() => {
    if (!entity_id) return;
    supabase
      .from("organisational_departments")
      .select("id, name")
      .eq("entity_id", entity_id)
      .order("name")
      .then(({ data }) => setOrgDepts(data ?? []));
  }, [entity_id]);

  /* Load employees when dept changes (individual filter) */
  useEffect(() => {
    if (!entity_id) return;
    if (!selectedDeptId) {
      supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("entity_id", entity_id)
        .order("first_name")
        .then(({ data }) =>
          setEmployees(
            (data ?? []).map((p) => ({
              id: p.id,
              name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            })),
          ),
        );
      return;
    }
    (async () => {
      const { data: junctionRows } = await supabase
        .from("people_org_departments")
        .select("person_id")
        .eq("org_department_id", selectedDeptId);

      const ids = (junctionRows ?? []).map((r) => r.person_id).filter(Boolean) as string[];
      if (!ids.length) { setEmployees([]); return; }

      const { data: people } = await supabase
        .from("people")
        .select("id, first_name, last_name")
        .in("id", ids)
        .eq("entity_id", entity_id)
        .order("first_name");

      setEmployees(
        (people ?? []).map((p) => ({
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        })),
      );
    })();
  }, [entity_id, selectedDeptId]);

  /* Reset employee selection when dept changes */
  useEffect(() => { setSelectedPersonId(""); }, [selectedDeptId]);

  /* Main loader */
  const load = useCallback(async () => {
    if (!entity_id || !person?.id) return;
    setLoading(true);

    try {
      const newKpis: KpiRow[] = [];

      /* ── Corporate KPIs ── */
      if (filter === "all" || filter === "corporate") {
        const { data: corpData } = await supabase
          .from("corporate_kpis")
          .select("id, kpi_definitions(id, title, description, driver, kpi_type, period_agg_type, scoring_type, input_mode, unit)")
          .eq("entity_id", entity_id)
          .eq("year", selected_year)
          .order("display_order");

        if (corpData?.length) {
          const corpIds = corpData.map((r) => r.id);

          const [tgtsRes, deptLinksRes] = await Promise.all([
            supabase
              .from("corporate_kpi_targets")
              .select("corporate_kpi_id, period, target_value, target_binary")
              .in("corporate_kpi_id", corpIds),
            supabase
              .from("department_kpis")
              .select("corporate_kpi_id, kpi_definitions(title)")
              .in("corporate_kpi_id", corpIds),
          ]);

          const tgtMap = new Map<string, Record<string, PeriodTarget>>();
          for (const t of tgtsRes.data ?? []) {
            if (!tgtMap.has(t.corporate_kpi_id)) tgtMap.set(t.corporate_kpi_id, {});
            tgtMap.get(t.corporate_kpi_id)![t.period] = {
              target_value: t.target_value ?? null,
              target_binary: t.target_binary ?? null,
            };
          }

          const deptLinksMap = new Map<string, string[]>();
          for (const dl of deptLinksRes.data ?? []) {
            const cid = (dl as unknown as { corporate_kpi_id: string | null }).corporate_kpi_id;
            const title = (dl.kpi_definitions as unknown as { title: string } | null)?.title;
            if (cid && title) {
              if (!deptLinksMap.has(cid)) deptLinksMap.set(cid, []);
              deptLinksMap.get(cid)!.push(title);
            }
          }

          for (const row of corpData) {
            const def = row.kpi_definitions as unknown as {
              id: string; title: string; description: string | null;
              driver: string; kpi_type: string; unit: string | null;
              period_agg_type: string | null; scoring_type: string | null; input_mode: string | null;
            } | null;
            if (!def) continue;
            const linkedTitles = deptLinksMap.get(row.id);
            newKpis.push({
              board_kpi_id:      row.id,
              kpi_definition_id: def.id,
              title:             def.title,
              description:       def.description,
              driver:            def.driver as KpiRow["driver"],
              kpi_type:          def.kpi_type as KpiRow["kpi_type"],
              period_agg_type:   def.period_agg_type as PeriodAggType | null,
              scoring_type:      def.scoring_type as ScoringType | null,
              input_mode:        def.input_mode as InputMode | null,
              unit:              def.unit,
              related_kpi:       linkedTitles?.join(", ") ?? null,
              period_targets:    tgtMap.get(row.id) ?? {},
              kpi_level:         "corporate",
            });
          }
        }
      }

      /* ── Department KPIs ── */
      if (filter === "all" || filter === "department") {
        const deptsToFetch =
          selectedDeptId ? [selectedDeptId] : orgDepts.map((d) => d.id);

        await Promise.all(
          deptsToFetch.map(async (deptId) => {
            const { data: deptData } = await supabase
              .from("department_kpis")
              .select("id, corporate_kpi_id, kpi_definitions(id, title, description, driver, kpi_type, period_agg_type, scoring_type, input_mode, unit)")
              .eq("entity_id", entity_id)
              .eq("year", selected_year)
              .eq("org_department_id", deptId)
              .order("display_order");

            if (!deptData?.length) return;

            const deptIds    = deptData.map((r) => r.id);
            const corpKpiIds = [
              ...new Set(
                deptData
                  .map((r) => (r as unknown as { corporate_kpi_id?: string | null }).corporate_kpi_id)
                  .filter(Boolean) as string[],
              ),
            ];

            const [tgtsRes, corpRes] = await Promise.all([
              supabase
                .from("department_kpi_targets")
                .select("department_kpi_id, period, target_value, target_binary")
                .in("department_kpi_id", deptIds),
              corpKpiIds.length
                ? supabase
                    .from("corporate_kpis")
                    .select("id, kpi_definitions(title)")
                    .in("id", corpKpiIds)
                : Promise.resolve({ data: [] as { id: string; kpi_definitions: unknown }[] }),
            ]);

            const tgtMap = new Map<string, Record<string, PeriodTarget>>();
            for (const t of tgtsRes.data ?? []) {
              if (!tgtMap.has(t.department_kpi_id)) tgtMap.set(t.department_kpi_id, {});
              tgtMap.get(t.department_kpi_id)![t.period] = {
                target_value: t.target_value ?? null,
                target_binary: t.target_binary ?? null,
              };
            }

            const corpTitleMap = new Map<string, string>();
            for (const ck of corpRes.data ?? []) {
              const title = (ck.kpi_definitions as unknown as { title: string } | null)?.title;
              if (title) corpTitleMap.set(ck.id, title);
            }

            for (const row of deptData) {
              const def = row.kpi_definitions as unknown as {
                id: string; title: string; description: string | null;
                driver: string; kpi_type: string; unit: string | null;
                period_agg_type: string | null; scoring_type: string | null; input_mode: string | null;
              } | null;
              if (!def) continue;
              const corpKpiId = (row as unknown as { corporate_kpi_id?: string | null }).corporate_kpi_id;
              newKpis.push({
                board_kpi_id:      row.id,
                kpi_definition_id: def.id,
                title:             def.title,
                description:       def.description,
                driver:            def.driver as KpiRow["driver"],
                kpi_type:          def.kpi_type as KpiRow["kpi_type"],
                period_agg_type:   def.period_agg_type as PeriodAggType | null,
                scoring_type:      def.scoring_type as ScoringType | null,
                input_mode:        def.input_mode as InputMode | null,
                unit:              def.unit,
                related_kpi:       corpKpiId ? (corpTitleMap.get(corpKpiId) ?? null) : null,
                period_targets:    tgtMap.get(row.id) ?? {},
                kpi_level:         "department",
              });
            }
          }),
        );
      }

      /* ── Individual KPIs ── */
      if (filter === "individual" && selectedPersonId) {
        const { data: indivData } = await supabase
          .from("individual_kpis")
          .select("id, kpi_definitions(id, title, description, driver, kpi_type, period_agg_type, scoring_type, input_mode, unit)")
          .eq("entity_id", entity_id)
          .eq("person_id", selectedPersonId)
          .eq("year", selected_year)
          .eq("is_active", true)
          .eq("status", "approved")
          .order("display_order");

        if (indivData?.length) {
          const indivIds = indivData.map((r) => r.id);
          const { data: indivTargets } = await supabase
            .from("individual_kpi_targets")
            .select("individual_kpi_id, period, target_value, target_binary")
            .in("individual_kpi_id", indivIds);

          const tgtMap = new Map<string, Record<string, PeriodTarget>>();
          for (const t of indivTargets ?? []) {
            if (!tgtMap.has(t.individual_kpi_id)) tgtMap.set(t.individual_kpi_id, {});
            tgtMap.get(t.individual_kpi_id)![t.period] = {
              target_value: t.target_value ?? null,
              target_binary: t.target_binary ?? null,
            };
          }

          for (const row of indivData) {
            const def = row.kpi_definitions as unknown as {
              id: string; title: string; description: string | null;
              driver: string; kpi_type: string; unit: string | null;
              period_agg_type: string | null; scoring_type: string | null; input_mode: string | null;
            } | null;
            if (!def) continue;
            newKpis.push({
              board_kpi_id:      row.id,
              kpi_definition_id: def.id,
              title:             def.title,
              description:       def.description,
              driver:            def.driver as KpiRow["driver"],
              kpi_type:          def.kpi_type as KpiRow["kpi_type"],
              period_agg_type:   def.period_agg_type as PeriodAggType | null,
              scoring_type:      def.scoring_type as ScoringType | null,
              input_mode:        def.input_mode as InputMode | null,
              unit:              def.unit,
              related_kpi:       null,
              period_targets:    tgtMap.get(row.id) ?? {},
              kpi_level:         "individual",
            });
          }
        }
      }

      setKpis(newKpis);

      /* ── Fetch existing actuals ── */
      if (!newKpis.length) { setActualsMap({}); return; }

      const kpiDefIds = [...new Set(newKpis.map((k) => k.kpi_definition_id))];

      let actualsQuery = supabase
        .from("actuals")
        .select("kpi_definition_id, kpi_level, period, actual_value, actual_binary, person_id")
        .eq("entity_id", entity_id)
        .in("kpi_definition_id", kpiDefIds);

      if (filter === "individual" && selectedPersonId) {
        actualsQuery = actualsQuery.eq("person_id", selectedPersonId);
      } else {
        actualsQuery = actualsQuery.eq("person_id", person.id);
      }

      const { data: actualsData } = await actualsQuery;

      // Map actuals back to board_kpi_id (avoids collision when two depts share a kpi_definition)
      const defLevelToBoards = new Map<string, string[]>();
      for (const kpi of newKpis) {
        const dlKey = `${kpi.kpi_definition_id}:${kpi.kpi_level}`;
        if (!defLevelToBoards.has(dlKey)) defLevelToBoards.set(dlKey, []);
        defLevelToBoards.get(dlKey)!.push(kpi.board_kpi_id);
      }

      const newActualsMap: KpiActualsMap = {};
      for (const a of actualsData ?? []) {
        const dlKey   = `${a.kpi_definition_id}:${a.kpi_level}`;
        const boardIds = defLevelToBoards.get(dlKey) ?? [];
        for (const bid of boardIds) {
          if (!newActualsMap[bid]) newActualsMap[bid] = {};
          if (!newActualsMap[bid][a.period]) {
            newActualsMap[bid][a.period] = {
              value:  a.actual_value !== null ? String(a.actual_value) : "",
              binary: a.actual_binary ?? null,
              dirty:  false,
            };
          }
        }
      }
      setActualsMap(newActualsMap);
    } finally {
      setLoading(false);
    }
  }, [entity_id, selected_year, filter, selectedDeptId, selectedPersonId, orgDepts, person]);

  useEffect(() => { void load(); }, [load]);

  /* ── Actuals state updaters ── */

  const updateActualValue = useCallback(
    (boardKpiId: string, period: string, value: string) => {
      setActualsMap((prev) => ({
        ...prev,
        [boardKpiId]: {
          ...(prev[boardKpiId] ?? {}),
          [period]: {
            ...(prev[boardKpiId]?.[period] ?? { value: "", binary: null }),
            value,
            dirty: true,
          },
        },
      }));
    },
    [],
  );

  const updateActualBinary = useCallback(
    (boardKpiId: string, period: string, binary: boolean | null) => {
      setActualsMap((prev) => ({
        ...prev,
        [boardKpiId]: {
          ...(prev[boardKpiId] ?? {}),
          [period]: {
            ...(prev[boardKpiId]?.[period] ?? { value: "", binary: null }),
            binary,
            dirty: true,
          },
        },
      }));
    },
    [],
  );

  /* ── Save handler ── */

  const saveKpiActuals = useCallback(
    async (kpi: KpiRow) => {
      if (!entity_id || !person?.id) return;
      const periodData = actualsMap[kpi.board_kpi_id] ?? {};

      setSavingSet((prev) => new Set(prev).add(kpi.board_kpi_id));
      try {
        const personIdForActual =
          kpi.kpi_level === "individual" ? selectedPersonId : person.id;

        const rows = PERIODS.flatMap((period) => {
          const isSaved = isDerivedPeriod(period as EngPeriod, kpi.period_agg_type);

          if (isSaved) {
            // For additive/weighted/etc. KPIs, auto-compute derived period from quarterly entries
            const av = effectiveActualValue(periodData, period, kpi.period_agg_type);
            if (av === null) return [];
            return [{
              entity_id,
              kpi_definition_id: kpi.kpi_definition_id,
              kpi_level: kpi.kpi_level,
              period,
              person_id:   personIdForActual || null,
              actual_value:  av,
              actual_binary: null,
              source:        "manual_entry",
              uploaded_by:   person.id,
            }];
          }

          const entry = periodData[period];
          const av = entry?.value !== "" && entry?.value != null ? Number(entry.value) : null;
          const ab = entry?.binary ?? null;
          if (av === null && ab === null) return [];
          return [{
            entity_id,
            kpi_definition_id: kpi.kpi_definition_id,
            kpi_level: kpi.kpi_level,
            period,
            person_id:   personIdForActual || null,
            actual_value:  av,
            actual_binary: ab,
            source:        "manual_entry",
            uploaded_by:   person.id,
          }];
        });

        if (!rows.length) { toast.info("No actuals to save."); return; }

        const { error } = await supabase
          .from("actuals")
          .upsert(rows, { onConflict: "entity_id,kpi_definition_id,kpi_level,period,person_id" });

        if (error) throw error;

        setActualsMap((prev) => {
          const updated: PeriodActualsMap = {};
          for (const [p, entry] of Object.entries(prev[kpi.board_kpi_id] ?? {})) {
            updated[p] = { ...entry, dirty: false };
          }
          return { ...prev, [kpi.board_kpi_id]: updated };
        });

        toast.success(`Actuals saved for "${kpi.title}".`);
      } catch (err) {
        console.error(err);
        toast.error(`Failed to save actuals for "${kpi.title}".`);
      } finally {
        setSavingSet((prev) => {
          const next = new Set(prev);
          next.delete(kpi.board_kpi_id);
          return next;
        });
      }
    },
    [entity_id, person, actualsMap, selectedPersonId],
  );

  /* ── Render ── */

  const showDeptSelector  = filter !== "corporate";
  const showEmpSelector   = filter === "individual";

  const noEmpSelected     = filter === "individual" && !selectedPersonId;
  const emptyState        =
    !loading &&
    !noEmpSelected &&
    kpis.length === 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Upload Actuals</h1>
        <p className="text-sm text-muted-foreground">{selected_year}</p>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 flex flex-wrap gap-2">
        {(["all", "corporate", "department", "individual"] as FilterTab[]).map((tab) => (
          <Button
            key={tab}
            variant={filter === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(tab)}
            className="capitalize"
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* Dept / Employee selectors */}
      {(showDeptSelector || showEmpSelector) && (
        <div className="shrink-0 flex flex-wrap items-center gap-3">
          {showDeptSelector && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">Department</span>
              <Select
                value={selectedDeptId || "__all__"}
                onValueChange={(v) => setSelectedDeptId(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  {filter !== "individual" && (
                    <SelectItem value="__all__">All departments</SelectItem>
                  )}
                  {orgDepts.filter((d) => d.id).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showEmpSelector && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">Employee</span>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter((e) => e.id).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {selectedDeptId ? "No employees in this department." : "No employees found."}
                    </div>
                  ) : (
                    employees.filter((e) => e.id).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* KPI panels */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : noEmpSelected ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Select a department and employee to view their KPIs.
          </p>
        ) : emptyState ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {filter === "individual"
              ? "No approved individual KPIs found for this employee."
              : "No KPIs found for the selected filters."}
          </p>
        ) : (
          <div className="space-y-3 pb-3">
            {kpis.map((kpi) => (
              <KpiPanel
                key={kpi.board_kpi_id}
                kpi={kpi}
                actuals={actualsMap[kpi.board_kpi_id] ?? {}}
                saving={savingSet.has(kpi.board_kpi_id)}
                onUpdateValue={(period, value) =>
                  updateActualValue(kpi.board_kpi_id, period, value)
                }
                onUpdateBinary={(period, binary) =>
                  updateActualBinary(kpi.board_kpi_id, period, binary)
                }
                onSave={() => void saveKpiActuals(kpi)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
