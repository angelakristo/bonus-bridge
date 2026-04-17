import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { AppShell } from "@/components/app-shell/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, ready: authReady, loading: authLoading, roles, supabaseUser, person } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const location = useLocation();

  const onRegisterEntity = location.pathname === "/register-entity";
  const isHrRep = roles.includes("hr_rep");
  const needsEntityRegistration = isHrRep && !entity_id;
  const shouldHoldRegisterEntity = onRegisterEntity && !!session && (!authReady || authLoading || entityLoading);

  const logGuard = (redirectTarget: string | null, reason: string) => {
    console.log("[Guard]", {
      pathname: location.pathname,
      userId: supabaseUser?.id ?? session?.user?.id ?? null,
      role: roles[0] ?? null,
      roles,
      entity_id,
      loading: {
        authReady,
        authLoading,
        entityLoading,
        personResolved: authReady,
      },
      redirectTarget,
      reason,
    });
  };

  useEffect(() => {
    if (!authReady || authLoading || entityLoading) {
      logGuard(null, "waiting for auth, role, person, and entity resolution before redirect decisions");
      return;
    }

    if (!session) {
      logGuard("/login", "no authenticated session");
      navigate({ to: "/login", replace: true });
      return;
    }

    if (needsEntityRegistration && !onRegisterEntity) {
      logGuard("/register-entity", "hr_rep resolved without entity_id, onboarding required");
      navigate({ to: "/register-entity", replace: true });
      return;
    }

    if (needsEntityRegistration && onRegisterEntity) {
      logGuard(null, "hr_rep without entity_id already on /register-entity, staying on onboarding screen");
      return;
    }

    if (isHrRep && entity_id && onRegisterEntity) {
      logGuard("/org-departments", "registration complete, leaving onboarding screen");
      navigate({ to: "/org-departments", replace: true });
      return;
    }

    logGuard(null, person ? "stay on requested authenticated route" : "stay on requested route with resolved missing person profile");
  }, [
    authReady,
    authLoading,
    entityLoading,
    session,
    needsEntityRegistration,
    entity_id,
    onRegisterEntity,
    location.pathname,
    navigate,
    roles,
    supabaseUser?.id,
    isHrRep,
    person,
  ]);

  if (shouldHoldRegisterEntity) {
    logGuard(null, "rendering /register-entity while auth or entity state finishes resolving");
    return <Outlet />;
  }

  if (!authReady || authLoading || entityLoading || !session) {
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
