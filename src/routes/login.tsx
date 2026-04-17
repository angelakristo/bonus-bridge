import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, ready: authReady, loading: authLoading, roles, signIn, devPreviewSignIn } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authReady || authLoading || entityLoading) return;
    if (!session) return;

    if (search.redirect) {
      console.log("[Login]", { reason: "explicit redirect target", redirectTarget: search.redirect });
      navigate({ to: search.redirect, replace: true });
      return;
    }

    const isHrRep = roles.includes("hr_rep");
    if (isHrRep && !entity_id) {
      console.log("[Login]", { reason: "hr_rep without entity", redirectTarget: "/register-entity", roles, entity_id });
      navigate({ to: "/register-entity", replace: true });
      return;
    }

    console.log("[Login]", { reason: "authenticated with entity", redirectTarget: "/dashboard", roles, entity_id });
    navigate({ to: "/dashboard", replace: true });
  }, [authReady, authLoading, entityLoading, session, roles, entity_id, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Failed to sign in");
      return;
    }

    toast.success("Signed in");
    // Navigation handled by the effect above once auth + entity resolve.
  };

  const handlePreview = (role: "ceo" | "hr_rep" | "manager" | "employee") => {
    devPreviewSignIn(role);
    toast.success(`Preview mode: ${role.toUpperCase()}`);
    // Navigation handled by the effect above once auth + entity resolve.
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/40 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={bonusbridgeLogo}
            alt="BonusBridge"
            className="h-28 w-auto drop-shadow-sm"
          />
        </div>

        <Card className="border-border/60 shadow-xl shadow-primary/5 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={submitting}
              >
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Preview mode
              </span>
              <Separator className="flex-1" />
            </div>

            <div className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Dev-only: skip auth and preview the app as a role.</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => handlePreview("ceo")}
                >
                  CEO
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => handlePreview("hr_rep")}
                >
                  HR Rep
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => handlePreview("manager")}
                >
                  Manager
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => handlePreview("employee")}
                >
                  Employee
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Invite-only access. Contact your admin if you need an account.
        </p>
      </div>
    </div>
  );
}
