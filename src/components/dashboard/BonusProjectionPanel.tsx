import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Tier = {
  id: string;
  threshold_min_pct: number;
  threshold_max_pct: number | null;
  bonus_pct_of_salary: number;
};

type Props = {
  personId: string;
  entityId: string;
  year: number;
  avgAchievementPct: number | null;
  isCeo?: boolean;
};

function matchTier(tiers: Tier[], pct: number): Tier | null {
  const sorted = [...tiers].sort((a, b) => b.threshold_min_pct - a.threshold_min_pct);
  return sorted.find(
    (t) => pct >= t.threshold_min_pct && (t.threshold_max_pct === null || pct < t.threshold_max_pct)
  ) ?? null;
}

export function BonusProjectionPanel({ personId, entityId, year, avgAchievementPct, isCeo }: Props) {
  const [loading, setLoading] = useState(true);
  const [schemeName, setSchemeName] = useState<string | null>(null);
  const [schemeId, setSchemeId] = useState<string | null>(null);
  const [salary, setSalary] = useState<number | null>(null);
  const [yearendEligible, setYearendEligible] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    if (!personId || !entityId) return;
    setLoading(true);
    let cancelled = false;

    (async () => {
      const { data: proj } = await supabase
        .from("v_bonus_projections")
        .select("scheme_name, bonus_scheme_id, annual_salary, yearend_bonus_eligible")
        .eq("person_id", personId)
        .eq("entity_id", entityId)
        .eq("year", year)
        .maybeSingle();

      if (cancelled) return;
      if (!proj) { setLoading(false); return; }

      setSchemeName(proj.scheme_name);
      setSchemeId(proj.bonus_scheme_id);
      setSalary(proj.annual_salary);
      setYearendEligible(proj.yearend_bonus_eligible ?? false);

      if (proj.bonus_scheme_id) {
        const { data: tierData } = await supabase
          .from("bonus_scheme_tiers")
          .select("id, threshold_min_pct, threshold_max_pct, bonus_pct_of_salary")
          .eq("bonus_scheme_id", proj.bonus_scheme_id)
          .order("threshold_min_pct", { ascending: true });
        if (!cancelled) setTiers((tierData ?? []).map(t => ({
          ...t,
          threshold_min_pct: Number(t.threshold_min_pct),
          threshold_max_pct: t.threshold_max_pct !== null ? Number(t.threshold_max_pct) : null,
          bonus_pct_of_salary: Number(t.bonus_pct_of_salary),
        })));
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [personId, entityId, year]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!schemeName) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">No bonus scheme assigned.</p>
        </CardContent>
      </Card>
    );
  }

  const matchedTier = avgAchievementPct !== null ? matchTier(tiers, avgAchievementPct) : null;
  const projectedPct = matchedTier?.bonus_pct_of_salary ?? null;
  const projectedEur = isCeo && salary !== null && projectedPct !== null
    ? Math.round((salary * projectedPct) / 100)
    : null;

  return (
    <Card className="border-primary/20 bg-primary/3">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          Bonus Projection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Scheme</span>
          <span className="text-sm font-medium">{schemeName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Year-End Eligible</span>
          <Badge variant={yearendEligible ? "default" : "secondary"}>
            {yearendEligible ? "Yes" : "No"}
          </Badge>
        </div>
        {avgAchievementPct !== null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Avg Achievement</span>
            <span className="text-sm font-medium">{Math.round(avgAchievementPct)}%</span>
          </div>
        )}
        {matchedTier ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Projected Bonus</span>
              <span className="text-sm font-semibold text-primary">{projectedPct}% of salary</span>
            </div>
            {projectedEur !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Projected Amount</span>
                <span className="text-sm font-bold text-primary">
                  EUR {projectedEur.toLocaleString()}
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {avgAchievementPct !== null ? "Below bonus threshold." : "No actuals recorded yet."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
