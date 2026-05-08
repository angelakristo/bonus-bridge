import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
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
  driver: string | null;
  kpi_type: string | null;
  scoring_type: string | null;
  unit: string | null;
  corporate_target_value: number | null;
  actual_value: number | null;
  actual_binary: boolean | null;
  achievement_pct: number | null;
  person_id: string | null;
};

type Person = { id: string; full_name: string };
type BonusRow = {
  person_id: string | null;
  scheme_name: string | null;
  yearend_bonus_eligible: boolean | null;
};

const DRIVER_STYLE: Record<string, { bg: string; text: string }> = {
  growth:     { bg: "bg-green-100", text: "text-green-800" },
  efficiency: { bg: "bg-blue-100",  text: "text-blue-800"  },
  culture:    { bg: "bg-amber-100", text: "text-amber-800" },
};

export function ManagerDashboard() {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const [period, setPeriod] = useState<Period>("q1");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamPeople, setTeamPeople] = useState<Person[]>([]);
  const [deptKpis, setDeptKpis] = useState<KpiRow[]>([]);
  const [indKpis, setIndKpis] = useState<KpiRow[]>([]);
  const [bonusRows, setBonusRows] = useState<BonusRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Load team person IDs once
  useEffect(() => {
    if (!person?.id || !entity_id) return;
    (async () => {
      const { data: myDepts } = await supabase
        .from("people_org_departments")
        .select("org_department_id")
        .eq("person_id", person.id);
      const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
      if (deptIds.length === 0) { setTeamIds([]); return; }

      const { data: peers } = await supabase
        .from("people_org_departments")
        .select("person_id")
        .in("org_department_id", deptIds);
      const ids = Array.from(new Set((peers ?? []).map((p) => p.person_id))).filter(
        (id) => id !== person.id
      );
      setTeamIds(ids);

      const { data: ppl } = await supabase
        .from("v_people_public")
        .select("id, first_name, last_name")
        .in("id", ids)
        .eq("is_active", true);
      setTeamPeople(
        (ppl ?? []).map((p) => ({ id: p.id ?? "", full_name: `${p.first_name} ${p.last_name}` }))
      );
    })();
  }, [person?.id, entity_id]);

  const load = useCallback(async () => {
    if (!entity_id || teamIds.length === 0) { setLoading(false); return; }
    setLoading(true);

    const [deptRes, indRes, bonusRes] = await Promise.all([
      supabase
        .from("v_kpi_actuals_with_targets")
        .select("kpi_definition_id,kpi_title,driver,kpi_type,scoring_type,unit,corporate_target_value,actual_value,actual_binary,achievement_pct,person_id")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .eq("period", period)
        .eq("kpi_level", "department"),
      supabase
        .from("v_kpi_actuals_with_targets")
        .select("kpi_definition_id,kpi_title,driver,kpi_type,scoring_type,unit,corporate_target_value,actual_value,actual_binary,achievement_pct,person_id")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .eq("period", period)
        .eq("kpi_level", "individual")
        .in("person_id", teamIds),
      supabase
        .from("v_bonus_projections")
        .select("person_id,scheme_name,yearend_bonus_eligible")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .in("person_id", teamIds),
    ]);

    if (deptRes.error) toast.error("Failed to load dept KPIs.");
    if (indRes.error) toast.error("Failed to load team KPIs.");

    setDeptKpis((deptRes.data ?? []) as KpiRow[]);
    setIndKpis((indRes.data ?? []) as KpiRow[]);
    setBonusRows((bonusRes.data ?? []) as BonusRow[]);
    setLoading(false);
  }, [entity_id, selected_year, period, teamIds]);

  useEffect(() => { void load(); }, [load]);

  // Per-person avg achievement
  const personAvg = (pid: string) => {
    const personRows = indKpis.filter((r) => r.person_id === pid);
    if (personRows.length === 0) return null;
    return personRows.reduce((s, r) => s + (r.achievement_pct ?? 0), 0) / personRows.length;
  };

  const bonusMap = new Map(bonusRows.map((b) => [b.person_id ?? "", b]));

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Team Performance</h1>
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
          {/* Dept KPIs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Department KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              {deptKpis.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground text-center">No dept actuals for this period.</p>
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
                    {deptKpis.map((r, i) => {
                      const ds = r.driver ? DRIVER_STYLE[r.driver] : null;
                      const isBinary = r.scoring_type === "binary" || (r.scoring_type == null && r.kpi_type === "binary");
                      return (
                        <TableRow key={r.kpi_definition_id ?? i}>
                          <TableCell className="font-medium">{r.kpi_title}</TableCell>
                          <TableCell>
                            {ds && (
                              <Badge variant="outline" className={cn("border-0 text-xs", ds.bg, ds.text)}>
                                {r.driver}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {isBinary ? "Required" : (r.corporate_target_value ?? "—")}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {isBinary ? (r.actual_binary ? "✓" : "✗") : (r.actual_value ?? "—")}
                          </TableCell>
                          <TableCell className="text-right">
                            <AchievementBadge pct={r.achievement_pct} isBinary={isBinary} binaryValue={r.actual_binary} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Members</CardTitle>
            </CardHeader>
            <CardContent>
              {teamPeople.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground text-center">No team members found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Avg Achievement</TableHead>
                      <TableHead>Bonus Scheme</TableHead>
                      <TableHead className="text-center">Year-End Eligible</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamPeople.map((p) => {
                      const avg = personAvg(p.id);
                      const bonus = bonusMap.get(p.id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.full_name}</TableCell>
                          <TableCell className="text-right">
                            <AchievementBadge pct={avg} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {bonus?.scheme_name ?? "Not assigned"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={bonus?.yearend_bonus_eligible ? "default" : "secondary"}>
                              {bonus?.yearend_bonus_eligible ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
