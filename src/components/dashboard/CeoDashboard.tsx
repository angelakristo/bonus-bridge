import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PeriodToggle, type Period } from "./PeriodToggle";
import { AchievementBadge } from "./AchievementBadge";
import { cn } from "@/lib/utils";

type KpiRow = {
  kpi_definition_id: string | null;
  kpi_title: string | null;
  driver: "growth" | "efficiency" | "culture" | null;
  kpi_type: "progressive" | "binary" | "benchmark" | null;
  unit: string | null;
  corporate_target_value: number | null;
  corporate_target_binary: boolean | null;
  actual_value: number | null;
  actual_binary: boolean | null;
  achievement_pct: number | null;
};

type BonusRow = {
  person_id: string | null;
  scheme_name: string | null;
  annual_salary: number | null;
  yearend_bonus_eligible: boolean | null;
};

type PersonRow = { id: string | null; first_name: string | null; last_name: string | null };

type DriverWeights = { growth_pct: number; efficiency_pct: number; culture_pct: number };

const DRIVER_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  growth:     { label: "Growth",     bg: "bg-green-50",  text: "text-green-800", border: "border-green-200" },
  efficiency: { label: "Efficiency", bg: "bg-blue-50",   text: "text-blue-800",  border: "border-blue-200"  },
  culture:    { label: "Culture",    bg: "bg-amber-50",  text: "text-amber-800", border: "border-amber-200" },
};

function avg(rows: KpiRow[]) {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.achievement_pct ?? 0), 0) / rows.length;
}

function fmt(val: number | null, unit: string | null) {
  if (val === null) return "—";
  return unit ? `${val} ${unit}` : String(val);
}

export function CeoDashboard() {
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const [period, setPeriod] = useState<Period>("q1");
  const [corpKpis, setCorpKpis] = useState<KpiRow[]>([]);
  const [bonusRows, setBonusRows] = useState<BonusRow[]>([]);
  const [personMap, setPersonMap] = useState<Record<string, string>>({});
  const [driverWeights, setDriverWeights] = useState<DriverWeights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!entity_id) return;
    setLoading(true);

    const [kpiRes, bonusRes, peopleRes, driverRes] = await Promise.all([
      supabase
        .from("v_kpi_actuals_with_targets")
        .select("kpi_definition_id,kpi_title,driver,kpi_type,unit,corporate_target_value,corporate_target_binary,actual_value,actual_binary,achievement_pct")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .eq("period", period)
        .eq("kpi_level", "corporate"),
      supabase
        .from("v_bonus_projections")
        .select("person_id,scheme_name,annual_salary,yearend_bonus_eligible")
        .eq("entity_id", entity_id)
        .eq("year", selected_year),
      supabase
        .from("v_people_public")
        .select("id,first_name,last_name")
        .eq("entity_id", entity_id)
        .eq("is_active", true),
      supabase
        .from("drivers")
        .select("growth_pct,efficiency_pct,culture_pct")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .maybeSingle(),
    ]);

    if (kpiRes.error) toast.error("Failed to load corporate KPIs.");

    setCorpKpis((kpiRes.data ?? []) as KpiRow[]);
    setBonusRows((bonusRes.data ?? []) as BonusRow[]);

    const map: Record<string, string> = {};
    for (const p of (peopleRes.data ?? []) as PersonRow[]) {
      if (p.id) map[p.id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    }
    setPersonMap(map);

    if (driverRes.data) {
      setDriverWeights({
        growth_pct: Number(driverRes.data.growth_pct),
        efficiency_pct: Number(driverRes.data.efficiency_pct),
        culture_pct: Number(driverRes.data.culture_pct),
      });
    }

    setLoading(false);
  }, [entity_id, selected_year, period]);

  useEffect(() => { void load(); }, [load]);

  const byDriver = (driver: string) => corpKpis.filter((r) => r.driver === driver);

  const driverPct = (driver: string) => {
    if (!driverWeights) return null;
    if (driver === "growth") return driverWeights.growth_pct;
    if (driver === "efficiency") return driverWeights.efficiency_pct;
    if (driver === "culture") return driverWeights.culture_pct;
    return null;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Company Performance</h1>
          <p className="text-sm text-muted-foreground">{selected_year}</p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Driver Scorecards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["growth", "efficiency", "culture"] as const).map((driver) => {
              const cfg = DRIVER_CONFIG[driver];
              const rows = byDriver(driver);
              const achievement = avg(rows);
              const weight = driverPct(driver);
              return (
                <Card key={driver} className={cn("border", cfg.border, cfg.bg)}>
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm font-semibold", cfg.text)}>{cfg.label}</span>
                      {weight !== null && (
                        <Badge variant="outline" className={cn("border-0 text-xs", cfg.bg, cfg.text)}>
                          {weight}% weight
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <span className={cn("text-2xl font-bold", cfg.text)}>
                        {achievement !== null ? `${Math.round(achievement)}%` : "—"}
                      </span>
                      <span className={cn("text-xs pb-1", cfg.text, "opacity-70")}>avg achievement</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{rows.length} KPI{rows.length !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Corporate KPI Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Corporate KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              {corpKpis.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground text-center">No corporate actuals for this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>KPI</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Achievement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {corpKpis.map((r, i) => {
                      const cfg = r.driver ? DRIVER_CONFIG[r.driver] : null;
                      const isBinary = r.kpi_type === "binary";
                      return (
                        <TableRow key={r.kpi_definition_id ?? i}>
                          <TableCell className="font-medium text-sm">{r.kpi_title}</TableCell>
                          <TableCell>
                            {cfg && (
                              <Badge variant="outline" className={cn("border-0 text-xs", cfg.bg, cfg.text)}>
                                {cfg.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {isBinary ? "Required" : fmt(r.corporate_target_value, r.unit)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {isBinary ? (r.actual_binary ? "✓" : "✗") : fmt(r.actual_value, r.unit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <AchievementBadge
                              pct={r.achievement_pct}
                              isBinary={isBinary}
                              binaryValue={r.actual_binary}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Company Bonus Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Company Bonus Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {bonusRows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground text-center">No bonus assignments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Bonus Scheme</TableHead>
                      <TableHead>Annual Salary</TableHead>
                      <TableHead className="text-center">Year-End Eligible</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonusRows.map((b, i) => (
                      <TableRow key={b.person_id ?? i}>
                        <TableCell className="font-medium text-sm">
                          {b.person_id ? (personMap[b.person_id] ?? "Unknown") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{b.scheme_name ?? "Not assigned"}</TableCell>
                        <TableCell className="text-sm">
                          {b.annual_salary !== null
                            ? `EUR ${b.annual_salary.toLocaleString()}`
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={b.yearend_bonus_eligible ? "default" : "secondary"}>
                            {b.yearend_bonus_eligible ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
