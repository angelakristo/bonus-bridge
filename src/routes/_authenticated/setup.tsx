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

type SetupStepStatus = Database["public"]["Enums"]["setup_step_status"];

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
});

type StepDef = {
  key: string;
  title: string;
  description: string;
};

const STEPS: StepDef[] = [
  { key: "register_entity", title: "Register Entity", description: "Set your organisation name and basic details." },
  { key: "build_org_departments", title: "Build Org Departments", description: "Create your organisational department hierarchy." },
  { key: "upload_employees", title: "Upload Employees", description: "Import your employee list from a spreadsheet." },
  { key: "assign_roles", title: "Assign Roles", description: "Give each person their CEO, manager, HR or employee role." },
  { key: "set_driver_weightings", title: "Set Driver Weightings", description: "Allocate % weight to Growth, Efficiency and Culture." },
  { key: "configure_corporate_kpis", title: "Configure Corporate KPIs", description: "Define the KPIs that apply company-wide." },
  { key: "configure_department_kpis", title: "Configure Department KPIs", description: "Define KPIs for each department." },
  { key: "employee_kpi_proposals", title: "Employee KPI Proposals", description: "Review and approve individual KPI proposals." },
  { key: "assign_weightings", title: "Assign Weightings", description: "Set how corporate / department / individual KPIs weigh per employee." },
  { key: "assign_bonus_schemes", title: "Assign Bonus Schemes", description: "Link each employee to a bonus scheme and tier." },
];

const STATUS_META: Record<SetupStepStatus, { label: string; variant: "secondary" | "default" | "outline"; className: string }> = {
  not_started: { label: "Not Started", variant: "outline", className: "" },
  in_progress: { label: "In Progress", variant: "secondary", className: "bg-accent/15 text-accent-foreground" },
  complete: { label: "Complete", variant: "default", className: "bg-primary text-primary-foreground" },
};

const ALLOWED_ROLES = ["ceo", "hr_rep"] as const;

function SetupPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const [progress, setProgress] = useState<Record<string, SetupStepStatus>>({});
  const [loading, setLoading] = useState(true);

  const allowed = roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));

  useEffect(() => {
    if (!entity_id || !allowed) {
      setLoading(false);
      return;
    }
    supabase
      .from("setup_progress")
      .select("step_key, status")
      .eq("entity_id", entity_id)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load setup progress:", error);
          toast.error("Failed to load setup progress");
        } else {
          const map: Record<string, SetupStepStatus> = {};
          data?.forEach((row) => {
            map[row.step_key] = row.status;
          });
          setProgress(map);
        }
        setLoading(false);
      });
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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup Checklist</h1>
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
        <ol className="space-y-3">
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
                      onClick={() => toast("Coming soon", { description: `${step.title} screen is not built yet.` })}
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
