import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, person, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome{person ? `, ${person.first_name}` : ""}</CardTitle>
          <CardDescription>You are signed in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium text-foreground">Name: </span>
              <span className="text-muted-foreground">
                {person ? `${person.first_name} ${person.last_name}` : "—"}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">Entity ID: </span>
              <span className="text-muted-foreground">{person?.entity_id ?? "—"}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Roles: </span>
              <span className="text-muted-foreground">
                {roles.length > 0 ? roles.join(", ") : "No roles assigned"}
              </span>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
