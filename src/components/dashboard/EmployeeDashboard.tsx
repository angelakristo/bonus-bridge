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
import { BonusProjectionPanel } from "./BonusProjectionPanel";
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

const DRIVER_STYLE: Record<string, { bg: string; text: string }> = {
  growth:     { bg: "bg-green-100", text: "text-green-800" },
  efficiency: { bg: "bg-blue-100",  text: "text-blue-800"  },
  culture:    { bg: "bg-amber-100", text: "text-amber-800" },
};

function fmt(val: number | null, unit: string | null) {
  if (val === null) return "—";
  return unit ? `${val} ${unit}` : String(val);
}

export function EmployeeDashboard() {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const [period, setPeriod] = useState<Period>("q1");
  const [rows, setRows] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!person?.id || !entity_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("v_kpi_actuals_with_targets")
      .select("kpi_definition_id,kpi_title,driver,kpi_type,unit,corporate_target_value,corporate_target_binary,actual_value,actual_binary,achievement_pct")
      .eq("entity_id", entity_id)
      .eq("person_id", person.id)
      .eq("year", selected_year)
      .eq("period", period)
      .eq("kpi_level", "individual");

    if (error) {
      toast.error("Failed to load KPI actuals.");
      console.error(error);
    } else {
      setRows((data ?? []) as KpiRow[]);
    }
    setLoading(false);
  }, [person?.id, entity_id, selected_year, period]);

  useEffect(() => { void load(); }, [load]);

  const avgAchievement = rows.length > 0
    ? rows.reduce((s, r) => s + (r.achievement_pct ?? 0), 0) / rows.length
    : null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header + Period Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            My Performance{person ? ` — ${person.first_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{selected_year} · Individual KPIs</p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {/* KPI Table */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm">Individual KPIs</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No actuals recorded for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Achievement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const ds = r.driver ? DRIVER_STYLE[r.driver] : null;
                  const isBinary = r.kpi_type === "binary";
                  return (
                    <TableRow key={r.kpi_definition_id ?? i}>
                      <TableCell className="font-medium">{r.kpi_title ?? "—"}</TableCell>
                      <TableCell>
                        {ds && (
                          <Badge variant="outline" className={cn("border-0 text-xs", ds.bg, ds.text)}>
                            {r.driver}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.kpi_type}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {isBinary ? "Required" : fmt(r.corporate_target_value, r.unit)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {isBinary
                          ? (r.actual_binary === null ? "—" : r.actual_binary ? "✓" : "✗")
                          : fmt(r.actual_value, r.unit)}
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

      {/* Bonus Projection */}
      {person?.id && entity_id && (
        <div className="shrink-0">
          <BonusProjectionPanel
            personId={person.id}
            entityId={entity_id}
            year={selected_year}
            avgAchievementPct={avgAchievement}
            isCeo={false}
          />
        </div>
      )}
    </div>
  );
}
