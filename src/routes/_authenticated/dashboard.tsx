import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { person, roles } = useAuth();
  const { entity_name } = useEntity();
  const { selected_year } = useYear();

  return (
    <div className="mx-auto w-full max-w-3xl">
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
