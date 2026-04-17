import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, ready: authReady, loading: authLoading, roles } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authReady || authLoading) {
      console.log("[Index]", {
        pathname: "/",
        reason: "waiting for auth resolution",
        loading: { authReady, authLoading, entityLoading },
        redirectTarget: null,
      });
      return;
    }

    if (!session) {
      console.log("[Index]", {
        pathname: "/",
        reason: "no session, redirect to login",
        redirectTarget: "/login",
      });
      navigate({ to: "/login", replace: true });
      return;
    }

    if (entityLoading) {
      console.log("[Index]", {
        pathname: "/",
        reason: "waiting for entity resolution",
        loading: { authReady, authLoading, entityLoading },
        redirectTarget: null,
      });
      return;
    }

    const isHrRep = roles.includes("hr_rep");
    if (isHrRep && !entity_id) {
      console.log("[Index]", {
        pathname: "/",
        reason: "hr_rep without entity, route to onboarding",
        roles,
        entity_id,
        redirectTarget: "/register-entity",
      });
      navigate({ to: "/register-entity", replace: true });
      return;
    }

    console.log("[Index]", {
      pathname: "/",
      reason: "authenticated with entity, route to dashboard",
      roles,
      entity_id,
      redirectTarget: "/dashboard",
    });
    navigate({ to: "/dashboard", replace: true });
  }, [authReady, authLoading, entityLoading, session, roles, entity_id, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
