import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ListChecks } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { person, roles } = useAuth();
  const { entity_name } = useEntity();
  const { selected_year } = useYear();
  const showSetupCta = roles.some((r) => r === "ceo" || r === "hr_rep");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {showSetupCta && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
              <ListChecks className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-foreground">Finish setting up BonusBridge</h3>
              <p className="text-sm text-muted-foreground">Work through the setup checklist to get your organisation ready.</p>
            </div>
            <Button asChild size="sm">
              <Link to="/setup">Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Welcome{person ? `, ${person.first_name}` : ""}</CardTitle>
          <CardDescription>Your BonusBridge dashboard for {selected_year}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="font-medium text-foreground">Name: </span>
            <span className="text-muted-foreground">
              {person ? `${person.first_name} ${person.last_name}` : "—"}
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground">Entity: </span>
            <span className="text-muted-foreground">{entity_name ?? "—"}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">Roles: </span>
            <span className="text-muted-foreground">
              {roles.length > 0 ? roles.join(", ") : "No roles assigned"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
