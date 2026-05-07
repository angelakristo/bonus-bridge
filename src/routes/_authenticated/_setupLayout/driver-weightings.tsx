import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrendingUp, Zap, Heart, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_setupLayout/driver-weightings")({
  component: DriverWeightingsPage,
});

type DriverKey = "growth" | "efficiency" | "culture";

const DRIVERS: {
  key: DriverKey;
  label: string;
  icon: typeof TrendingUp;
  iconClass: string;
}[] = [
  { key: "growth", label: "Growth", icon: TrendingUp, iconClass: "text-green-600" },
  { key: "efficiency", label: "Efficiency", icon: Zap, iconClass: "text-blue-600" },
  { key: "culture", label: "Culture", icon: Heart, iconClass: "text-amber-600" },
];

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function DriverWeightingsPage() {
  const { roles } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();
  const allowed = roles.includes("ceo");

  const [values, setValues] = useState<Record<DriverKey, number>>({
    growth: 33,
    efficiency: 33,
    culture: 34,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const handleProceed = async () => {
    if (!entity_id) return;
    if (!existingId) {
      toast.error("Save your driver weightings before proceeding.");
      return;
    }
    setProceeding(true);
    try {
      const { error } = await supabase.from("setup_progress").upsert(
        { entity_id, step_key: "set_driver_weightings", status: "complete", updated_at: new Date().toISOString() },
        { onConflict: "entity_id,step_key" },
      );
      if (error) throw error;
      navigate({ to: "/kpi-board" });
    } catch {
      toast.error("Failed to proceed. Please try again.");
    } finally {
      setProceeding(false);
    }
  };

  useEffect(() => {
    if (!allowed || !entity_id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("drivers")
        .select("id, growth_pct, efficiency_pct, culture_pct")
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("[DriverWeightings] load error", error);
        toast.error("Failed to load driver weightings.");
      }

      if (data) {
        setExistingId(data.id);
        setValues({
          growth: Number(data.growth_pct) || 0,
          efficiency: Number(data.efficiency_pct) || 0,
          culture: Number(data.culture_pct) || 0,
        });
      } else {
        setExistingId(null);
        setValues({ growth: 33, efficiency: 33, culture: 34 });
      }
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, entity_id, selected_year]);

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          Access denied. Only the CEO can set driver weightings.
        </p>
      </div>
    );
  }

  const total = values.growth + values.efficiency + values.culture;
  const isValid = total === 100;
  const ready = !!entity_id && !entityLoading && !loading;

  const updateValue = (key: DriverKey, n: number) => {
    setValues((prev) => ({ ...prev, [key]: clamp(n) }));
  };

  const handleSave = async () => {
    if (!entity_id || !isValid) return;
    setSaving(true);
    try {
      if (existingId) {
        const { error } = await supabase
          .from("drivers")
          .update({
            growth_pct: values.growth,
            efficiency_pct: values.efficiency,
            culture_pct: values.culture,
          })
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("drivers")
          .insert({
            entity_id,
            year: selected_year,
            growth_pct: values.growth,
            efficiency_pct: values.efficiency,
            culture_pct: values.culture,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (data) setExistingId(data.id);
      }
      toast.success(`Driver weightings saved for ${selected_year}.`);
    } catch (err) {
      console.error("[DriverWeightings] save error", err);
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? JSON.stringify(err);
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Driver Weightings</h1>
        <p className="text-sm text-muted-foreground">
          Year:{" "}
          <span className="font-medium text-foreground">{selected_year}</span>
        </p>
      </div>

      {!ready ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {DRIVERS.map(({ key, label, icon: Icon, iconClass }) => (
              <Card key={key}>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Icon className={cn("h-5 w-5", iconClass)} />
                  <CardTitle className="text-lg">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={values[key]}
                      onChange={(e) =>
                        updateValue(key, Number(e.target.value))
                      }
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Slider
                    value={[values[key]]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => updateValue(key, v[0] ?? 0)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center">
            <p
              className={cn(
                "text-3xl font-semibold tracking-tight",
                isValid ? "text-foreground" : "text-destructive",
              )}
            >
              Total: {total}%
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isValid ? -1 : 0}>
                    <Button
                      variant="outline"
                      onClick={handleSave}
                      disabled={!isValid || saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!isValid && (
                  <TooltipContent>Weightings must sum to 100%</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Button onClick={handleProceed} disabled={proceeding || !entity_id}>
              {proceeding ? "Saving..." : "Proceed to KPI Board"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
