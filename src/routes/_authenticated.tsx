import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { AppShell } from "@/components/app-shell/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, ready: authReady, roles, supabaseUser } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const location = useLocation();

  const onRegisterEntity = location.pathname === "/register-entity";
  const isHrRep = roles.includes("hr_rep");
  const needsEntityRegistration = isHrRep && !entity_id;

  useEffect(() => {
    // Hold all redirects until auth + entity have fully resolved.
    if (!authReady || entityLoading) {
      console.log("[Guard] Waiting…", {
        authReady,
        entityLoading,
        pathname: location.pathname,
      });
      return;
    }

    // 1. Not signed in → login
    if (!session) {
      console.log("[Guard] Redirect → /login (no session)", { pathname: location.pathname });
      navigate({ to: "/login", replace: true });
      return;
    }

    // 2. hr_rep with no entity → must be on /register-entity
    if (needsEntityRegistration && !onRegisterEntity) {
      console.log("[Guard] Redirect → /register-entity", {
        userId: supabaseUser?.id,
        roles,
        entity_id,
        pathname: location.pathname,
        reason: "hr_rep without entity_id",
      });
      navigate({ to: "/register-entity", replace: true });
      return;
    }

    // 3. User has entity but is sitting on /register-entity → send to app
    if (!needsEntityRegistration && entity_id && onRegisterEntity) {
      console.log("[Guard] Redirect → /org-departments", {
        userId: supabaseUser?.id,
        roles,
        entity_id,
        pathname: location.pathname,
        reason: "registration already complete",
      });
      navigate({ to: "/org-departments", replace: true });
      return;
    }

    console.log("[Guard] Stay", {
      userId: supabaseUser?.id,
      roles,
      entity_id,
      pathname: location.pathname,
    });
  }, [
    authReady,
    entityLoading,
    session,
    needsEntityRegistration,
    entity_id,
    onRegisterEntity,
    location.pathname,
    navigate,
    roles,
    supabaseUser?.id,
  ]);

  if (!authReady || entityLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Render the registration screen WITHOUT the app shell so it owns the viewport.
  if (onRegisterEntity) {
    return <Outlet />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
