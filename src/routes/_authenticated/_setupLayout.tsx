import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
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
  const { entity_id } = useEntity();
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

      const derived: Record<string, SetupStepStatus> = {};
      derived.register_entity = entity_id ? "complete" : "not_started";

      if (!entity_id) {
        if (!cancelled) {
          setProgress(derived);
          setLoading(false);
        }
        return;
      }

      const [progressRes, orgDeptRes, peopleRes] = await Promise.all([
        supabase
          .from("setup_progress")
          .select("step_key, status")
          .eq("entity_id", entity_id),
        supabase
          .from("organisational_departments")
          .select("id", { head: true, count: "exact" })
          .eq("entity_id", entity_id),
        supabase
          .from("people")
          .select("id", { head: true, count: "exact" })
          .eq("entity_id", entity_id),
      ]);

      if (cancelled) return;

      // Fallback from setup_progress table for keys without derivation
      (progressRes.data ?? []).forEach((row) => {
        derived[row.step_key] = row.status;
      });

      // Derived auto-completion (overrides setup_progress for these keys)
      derived.register_entity = "complete";
      derived.build_org_departments =
        (orgDeptRes.count ?? 0) > 0 ? "complete" : derived.build_org_departments ?? "not_started";
      derived.upload_employees =
        (peopleRes.count ?? 0) > 0 ? "complete" : derived.upload_employees ?? "not_started";

      setProgress(derived);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [entity_id, allowed]);

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

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <SetupChecklist
        progress={progress}
        loading={loading}
        className="w-full lg:w-72 lg:shrink-0"
      />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
