import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { AppShell } from "@/components/app-shell/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading, roles, person } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (loading || entityLoading || !session || !person) return;
    const isHrRepNoEntity = roles.includes("hr_rep") && !entity_id;
    const onRegister = location.pathname === "/register-entity";
    if (isHrRepNoEntity && !onRegister) {
      navigate({ to: "/register-entity" });
    } else if (!isHrRepNoEntity && entity_id && onRegister) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, entityLoading, session, person, roles, entity_id, location.pathname, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
