import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import {
  masterCreateProject,
  type BootstrapUserInput,
  type CreateProjectResult,
} from "@/integrations/supabase/master.functions";
import { supabase } from "@/integrations/supabase/client";
import { useMasterAuth } from "@/contexts/MasterAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/master/new-project")({
  component: NewProjectPage,
});

type UserDraft = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  showPassword: boolean;
  roles: ("ceo" | "hr_rep")[];
};

const EMPTY_USER = (): UserDraft => ({
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  showPassword: false,
  roles: ["ceo"],
});

function NewProjectPage() {
  const createFn = useServerFn(masterCreateProject);
  const navigate = useNavigate();
  const { masterSignOut } = useMasterAuth();

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [users, setUsers] = useState<UserDraft[]>([EMPTY_USER()]);
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<CreateProjectResult | null>(null);
  const [openingEmail, setOpeningEmail] = useState<string | null>(null);
  const [openPassword, setOpenPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const updateUser = (idx: number, patch: Partial<UserDraft>) =>
    setUsers((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));

  const addUser = () => setUsers((prev) => [...prev, EMPTY_USER()]);

  const removeUser = (idx: number) =>
    setUsers((prev) => prev.filter((_, i) => i !== idx));

  const toggleRole = (idx: number, role: "ceo" | "hr_rep") => {
    const current = users[idx].roles;
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    updateUser(idx, { roles: next as ("ceo" | "hr_rep")[] });
  };

  const validate = (): string | null => {
    if (!companyName.trim()) return "Company name is required.";
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u.first_name.trim()) return `User ${i + 1}: first name is required.`;
      if (!u.last_name.trim()) return `User ${i + 1}: last name is required.`;
      if (!u.email.trim() || !/^\S+@\S+\.\S+$/.test(u.email))
        return `User ${i + 1}: valid email is required.`;
      if (u.password.length < 6) return `User ${i + 1}: password must be at least 6 characters.`;
      if (u.roles.length === 0) return `User ${i + 1}: must have at least one role (CEO or HR Rep).`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    setSubmitting(true);
    try {
      const input: { name: string; industry?: string; bootstrap_users: BootstrapUserInput[] } = {
        name: companyName.trim(),
        industry: industry.trim() || undefined,
        bootstrap_users: users.map((u) => ({
          first_name: u.first_name.trim(),
          last_name: u.last_name.trim(),
          email: u.email.trim().toLowerCase(),
          password: u.password,
          roles: u.roles,
        })),
      };

      const res = await createFn({ data: input });
      setResult(res);
    } catch (err) {
      toast.error(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenProject = async (email: string) => {
    if (!openPassword) { toast.error("Enter the password to open the project."); return; }
    setSigningIn(true);
    masterSignOut();
    const { error } = await supabase.auth.signInWithPassword({ email, password: openPassword });
    setSigningIn(false);
    if (error) { toast.error(`Sign in failed: ${error.message}`); return; }
    toast.success(`Signed in as ${email}`);
    navigate({ to: "/setup", replace: true });
  };

  // ── Success view ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/master" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to projects
          </Link>
        </div>

        <div className="rounded-xl border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-4 text-xl font-semibold">Project created</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{result.entity_name}</span> is ready.
          </p>
        </div>

        {result.errors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              Some users failed to create
            </div>
            <ul className="mt-2 space-y-1">
              {result.errors.map((e) => (
                <li key={e.email} className="text-xs text-muted-foreground">
                  <span className="font-medium">{e.email}</span> — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.created_users.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Created accounts</h3>
            <div className="space-y-3">
              {result.created_users.map((u) => (
                <Card key={u.email}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-medium">{u.first_name} {u.last_name}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      <div className="mt-1 flex gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px]">
                            {r === "ceo" ? "CEO" : "HR Rep"}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(u.email); toast.success("Email copied"); }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Copy email"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick open — enter password once to sign in as any created user */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">Open project now</p>
              <p className="text-xs text-muted-foreground">
                Enter a user's password to sign in and access the project dashboard.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Enter password…"
                  value={openPassword}
                  onChange={(e) => setOpenPassword(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.created_users.map((u) => (
                  <Button
                    key={u.email}
                    size="sm"
                    variant="outline"
                    disabled={signingIn || !openPassword}
                    onClick={() => {
                      setOpeningEmail(u.email);
                      void handleOpenProject(u.email);
                    }}
                    className="gap-1.5"
                  >
                    {signingIn && openingEmail === u.email ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Open as {u.first_name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link to="/master">Back to projects</Link>
          </Button>
          <Button onClick={() => { setResult(null); setCompanyName(""); setIndustry(""); setUsers([EMPTY_USER()]); }}>
            Create another project
          </Button>
        </div>
      </div>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/master">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Project</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Register a client organisation and create their admin account(s).
          </p>
        </div>
      </div>

      {/* Company details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company details</CardTitle>
          <CardDescription>Basic information about the client organisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">
              Company name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company-name"
              placeholder="e.g. Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              placeholder="e.g. Technology Services, Financial Services"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              maxLength={200}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bootstrap users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Admin accounts</CardTitle>
              <CardDescription>
                Create at least one CEO or HR Rep who will manage this project.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addUser} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              Add user
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {users.map((user, idx) => (
            <div key={idx}>
              {idx > 0 && <Separator className="mb-6" />}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">User {idx + 1}</p>
                  {users.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUser(idx)}
                      className="h-7 gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First name <span className="text-destructive">*</span></Label>
                    <Input
                      value={user.first_name}
                      onChange={(e) => updateUser(idx, { first_name: e.target.value })}
                      placeholder="Sofia"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name <span className="text-destructive">*</span></Label>
                    <Input
                      value={user.last_name}
                      onChange={(e) => updateUser(idx, { last_name: e.target.value })}
                      placeholder="Andersen"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={user.email}
                    onChange={(e) => updateUser(idx, { email: e.target.value })}
                    placeholder="sofia@company.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={user.showPassword ? "text" : "password"}
                      value={user.password}
                      onChange={(e) => updateUser(idx, { password: e.target.value })}
                      placeholder="Min. 6 characters"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => updateUser(idx, { showPassword: !user.showPassword })}
                    >
                      {user.showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Role(s) <span className="text-destructive">*</span></Label>
                  <p className="text-xs text-muted-foreground">
                    At least one role is required. A user can hold both CEO and HR Rep roles.
                  </p>
                  <div className="flex gap-4">
                    {(["ceo", "hr_rep"] as const).map((role) => (
                      <label key={role} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={user.roles.includes(role)}
                          onCheckedChange={() => toggleRole(idx, role)}
                        />
                        <span className="text-sm font-medium">
                          {role === "ceo" ? "CEO" : "HR Rep"}
                        </span>
                      </label>
                    ))}
                  </div>
                  {user.roles.length === 0 && (
                    <p className="text-xs text-destructive">Select at least one role.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button asChild variant="outline" disabled={submitting}>
          <Link to="/master">Cancel</Link>
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Project
        </Button>
      </div>
    </div>
  );
}
