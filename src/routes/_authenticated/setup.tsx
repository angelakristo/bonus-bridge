import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, ArrowRight } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STEPS } from "@/components/setup/steps";

type SetupStepStatus = Database["public"]["Enums"]["setup_step_status"];

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
});

const STATUS_META: Record<SetupStepStatus, { label: string; variant: "secondary" | "default" | "outline"; className: string }> = {
  not_started: { label: "Not Started", variant: "outline", className: "" },
  in_progress: { label: "In Progress", variant: "secondary", className: "bg-accent/15 text-accent-foreground" },
  complete: { label: "Complete", variant: "default", className: "bg-primary text-primary-foreground" },
};

const ALLOWED_ROLES = ["ceo", "hr_rep"] as const;

function SetupPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Record<string, SetupStepStatus>>({});
  const [loading, setLoading] = useState(true);

  const allowed = roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));

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

      const [progressRes, orgDeptRes, uploadsRes] = await Promise.all([
        supabase.from("setup_progress").select("step_key, status").eq("entity_id", entity_id),
        supabase
          .from("organisational_departments")
          .select("id", { head: true, count: "exact" })
          .eq("entity_id", entity_id),
        supabase
          .from("excel_uploads")
          .select("id", { head: true, count: "exact" })
          .eq("entity_id", entity_id)
          .eq("upload_type", "employees"),
      ]);

      if (cancelled) return;

      if (progressRes.error) {
        console.error("Failed to load setup progress:", progressRes.error);
        toast.error("Failed to load setup progress");
      }

      (progressRes.data ?? []).forEach((row) => {
        derived[row.step_key] = row.status;
      });

      derived.register_entity = "complete";
      derived.build_org_departments =
        (orgDeptRes.count ?? 0) > 0 ? "complete" : derived.build_org_departments ?? "not_started";
      derived.upload_employees =
        (uploadsRes.count ?? 0) > 0 ? "complete" : derived.upload_employees ?? "not_started";

      setProgress(derived);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [entity_id, allowed]);

  const completedCount = useMemo(
    () => STEPS.filter((s) => progress[s.key] === "complete").length,
    [progress],
  );

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              The setup checklist is only available to CEO and HR Rep users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Setup Checklist</h1>
        <p className="text-sm text-muted-foreground">
          Complete each step to finish configuring BonusBridge for your organisation.
          {" "}
          <span className="font-medium text-foreground">
            {completedCount}/{STEPS.length} complete
          </span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <ol className="space-y-2">
          {STEPS.map((step, idx) => {
            const status: SetupStepStatus = progress[step.key] ?? "not_started";
            const meta = STATUS_META[status];
            const isComplete = status === "complete";
            return (
              <li key={step.key}>
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium text-muted-foreground">
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : status === "in_progress" ? (
                        <Circle className="h-5 w-5 text-accent-foreground" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium text-foreground">{step.title}</h3>
                        <Badge variant={meta.variant} className={meta.className}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    <Button
                      variant={isComplete ? "outline" : "default"}
                      size="sm"
                      onClick={() => {
                        if (step.route) {
                          navigate({ to: step.route });
                        } else {
                          toast("Coming soon", { description: `${step.title} screen is not built yet.` });
                        }
                      }}
                    >
                      Go <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
