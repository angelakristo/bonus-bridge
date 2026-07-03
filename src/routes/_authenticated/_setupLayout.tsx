import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useSetupStatus } from "@/contexts/SetupContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupChecklist } from "@/components/setup/SetupChecklist";
import type { Database } from "@/integrations/supabase/types";

type SetupStepStatus = Database["public"]["Enums"]["setup_step_status"];

export const Route = createFileRoute("/_authenticated/_setupLayout")({
  component: SetupLayout,
});

function SetupLayout() {
  const { roles } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const { isSetupComplete, loading: setupLoading } = useSetupStatus();
  const location = useLocation();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  const [progress, setProgress] = useState<Record<string, SetupStepStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      if (!entity_id) {
        if (!cancelled) {
          const fallback: Record<string, SetupStepStatus> = {
            register_entity: entityLoading ? "in_progress" : "not_started",
          };
          setProgress(fallback);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("setup_progress")
        .select("step_key, status")
        .eq("entity_id", entity_id);

      if (cancelled) return;

      if (error) {
        console.error("[SetupLayout] failed to load progress", error);
        setProgress({});
        setLoading(false);
        return;
      }

      const derived: Record<string, SetupStepStatus> = {};
      (data ?? []).forEach((row) => {
        derived[row.step_key] = row.status;
      });

      derived.register_entity = "complete";

      const kpiSubKeys = ["set_driver_weightings", "configure_corporate_kpis", "configure_department_kpis"];
      const kpiStatuses = kpiSubKeys.map((k) => derived[k] ?? "not_started");
      if (kpiStatuses.every((s) => s === "complete")) {
        derived["kpi_setup"] = "complete";
      } else if (kpiStatuses.some((s) => s === "complete" || s === "in_progress")) {
        derived["kpi_setup"] = "in_progress";
      } else {
        derived["kpi_setup"] = "not_started";
      }

      setProgress(derived);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [entity_id, entityLoading, allowed, location.pathname]);

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              The setup screens are only available to CEO and HR Rep users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!setupLoading && isSetupComplete) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <SetupChecklist
        progress={progress}
        loading={loading}
        className="w-full lg:w-64 lg:shrink-0"
      />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
