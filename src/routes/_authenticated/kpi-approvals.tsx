import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Search = { person_id?: string };

export const Route = createFileRoute("/_authenticated/kpi-approvals")({
  component: KpiApprovalsPage,
  validateSearch: (search: Record<string, unknown>): Search => ({
    person_id: typeof search.person_id === "string" ? search.person_id : undefined,
  }),
});

function KpiApprovalsPage() {
  const { roles } = useAuth();
  const { person_id } = Route.useSearch();
  const allowed = roles.some((r) => r === "ceo" || r === "manager");

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KPI Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review individual KPIs submitted for approval.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending review</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {person_id
              ? `Filtered to employee ${person_id}.`
              : "Showing all employees."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Approval workflow UI coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
