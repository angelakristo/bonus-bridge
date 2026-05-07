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

export const Route = createFileRoute("/_authenticated/_setupLayout/register-entity")({
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
  const [prefilling, setPrefilling] = useState(false);

  const isHrRep = roles.includes("hr_rep");
  const isExisting = !!entity_id;

  const logRegisterEntity = (redirectTarget: string | null, reason: string) => {
    console.log("[RegisterEntity]", {
      pathname: location.pathname,
      userId: supabaseUser?.id ?? null,
      roles,
      entity_id,
      isExisting,
      loading: { authReady, authLoading, entityLoading, submitting, prefilling },
      redirectTarget,
      reason,
    });
  };

  // Access guard: only hr_rep
  useEffect(() => {
    if (!authReady || authLoading) return;
    if (!isHrRep) {
      console.log("[RegisterEntity] Access denied — user is not hr_rep", { roles });
      toast.error("Access denied: only HR Reps can register a company");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [authReady, authLoading, isHrRep, roles, navigate]);

  // Prepopulate from existing entity
  useEffect(() => {
    if (!entity_id) return;
    setPrefilling(true);
    supabase
      .from("entities")
      .select("id, name, industry")
      .eq("id", entity_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[RegisterEntity] Failed to load existing entity:", error);
        } else if (data) {
          setName(data.name ?? "");
          setIndustry(data.industry ?? "");
          logRegisterEntity(null, `prefilled form from existing entity ${data.id}`);
        }
        setPrefilling(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity_id]);

  if (authReady && !authLoading && !isHrRep) {
    return (
      <p className="text-sm text-muted-foreground">Access denied. Redirecting...</p>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const parsed = schema.safeParse({ name, industry: industry || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);

    if (isExisting && entity_id) {
      const { data, error } = await supabase
        .from("entities")
        .update({
          name: parsed.data.name,
          industry: parsed.data.industry ?? null,
        })
        .eq("id", entity_id)
        .select("id, name")
        .single();
      setSubmitting(false);

      if (error || !data) {
        console.error("[RegisterEntity] Update failed:", error);
        logRegisterEntity(null, `entity update failed: ${error?.message ?? "unknown"}`);
        toast.error(error?.message ?? "Failed to update company");
        return;
      }

      setEntity(data.id, data.name);
      await supabase.from("setup_progress").upsert(
        { entity_id: data.id, step_key: "register_entity", status: "complete", updated_at: new Date().toISOString() },
        { onConflict: "entity_id,step_key" },
      );
      logRegisterEntity("/org-departments", `entity updated (${data.id})`);
      toast.success("Company details saved");
      navigate({ to: "/org-departments", replace: true });
      return;
    }

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
      logRegisterEntity(null, `entity insert failed: ${error?.message ?? "unknown"}`);
      toast.error(error?.message ?? "Failed to register company");
      return;
    }

    setEntity(data.id, data.name);
    await supabase.from("setup_progress").upsert(
      { entity_id: data.id, step_key: "register_entity", status: "complete", updated_at: new Date().toISOString() },
      { onConflict: "entity_id,step_key" },
    );
    logRegisterEntity("/org-departments", `entity created (${data.id})`);
    toast.success("Company registered");
    navigate({ to: "/org-departments", replace: true });
  };

  const submitLabel = submitting
    ? isExisting ? "Saving..." : "Registering..."
    : "Proceed to Department Setup";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {isExisting ? "Confirm your company details" : "Register your company"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isExisting
            ? "Review and update your organisation details, then continue."
            : "Create your organisation to begin setting up BonusBridge."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
          <CardDescription>
            These details identify your organisation across BonusBridge.
          </CardDescription>
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
                disabled={prefilling}
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
                disabled={prefilling}
              />
            </div>
            <Button type="submit" disabled={submitting || prefilling}>
              {submitLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
