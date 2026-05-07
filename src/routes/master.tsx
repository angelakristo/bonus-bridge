import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogOut, Briefcase } from "lucide-react";

import { useMasterAuth } from "@/contexts/MasterAuthContext";
import { Button } from "@/components/ui/button";
import bonusbridgeFull from "@/assets/bonusbridge-full.png";

export const Route = createFileRoute("/master")({
  component: MasterLayout,
});

function MasterLayout() {
  const { isMaster, masterSignOut } = useMasterAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMaster) {
      navigate({ to: "/login", replace: true });
    }
  }, [isMaster, navigate]);

  if (!isMaster) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  const handleSignOut = () => {
    masterSignOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="shrink-0 border-b bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src={bonusbridgeFull} alt="BonusBridge" className="h-7 w-auto" />
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wide">
                Consultant Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">sp@tc.mk</span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
