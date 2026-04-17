import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

export const Route = createFileRoute("/_authenticated/register-entity")({
  component: RegisterEntityPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200, "Max 200 characters"),
  industry: z.string().trim().max(200, "Max 200 characters").optional(),
});

function RegisterEntityPage() {
  const { setEntity, entity_id, loading: entityLoading } = useEntity();
  const { supabaseUser, roles, ready: authReady, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const logRegisterEntity = (redirectTarget: string | null, reason: string) => {
    console.log("[RegisterEntity]", {
      pathname: location.pathname,
      userId: supabaseUser?.id ?? null,
      role: roles[0] ?? null,
      roles,
      entity_id,
      loading: {
        authReady,
        authLoading,
        entityLoading,
        submitting,
      },
      redirectTarget,
      reason,
    });
  };

  useEffect(() => {
    logRegisterEntity(null, "register-entity screen rendered");
  }, [authLoading, authReady, entityLoading, entity_id, location.pathname, roles, submitting, supabaseUser?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    logRegisterEntity(null, "submit requested");

    const parsed = schema.safeParse({ name, industry: industry || undefined });
    if (!parsed.success) {
      logRegisterEntity(null, `validation failed: ${parsed.error.issues[0]?.message ?? "invalid input"}`);
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from("entities")
      .insert({
        name: parsed.data.name,
        industry: parsed.data.industry ?? null,
        created_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();
    setSubmitting(false);

    if (error || !data) {
      console.error("[RegisterEntity] Insert failed:", error);
      logRegisterEntity(null, `entity insert failed: ${error?.message ?? "unknown error"}`);
      toast.error(error?.message ?? "Failed to register company");
      return;
    }

    setEntity(data.id, data.name);
    logRegisterEntity("/org-departments", `entity created successfully (${data.id})`);
    toast.success("Company registered");
    navigate({ to: "/org-departments", replace: true });
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

      <Card className="relative w-full max-w-md border-border/60 shadow-xl backdrop-blur">
        <CardHeader className="items-center space-y-4 text-center">
          <img src={bonusbridgeLogo} alt="BonusBridge" className="h-16 w-auto" />
          <div className="space-y-1">
            <CardTitle className="text-2xl">Register your company</CardTitle>
            <CardDescription>
              Create your organisation to begin setting up BonusBridge.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                maxLength={200}
                placeholder="Technology Services, Financial Services, Manufacturing"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Registering..." : "Register Company"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
