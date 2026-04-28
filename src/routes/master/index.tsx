import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Users, Plus, ExternalLink, Shield, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { masterListProjects, type ProjectSummary } from "@/integrations/supabase/master.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/master/")({
  component: MasterProjectsPage,
});

const ROLE_COLOURS: Record<string, string> = {
  ceo: "bg-violet-100 text-violet-700 border-violet-200",
  hr_rep: "bg-blue-100 text-blue-700 border-blue-200",
};

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  hr_rep: "HR Rep",
};

function MasterProjectsPage() {
  const listFn = useServerFn(masterListProjects);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Open-project dialog state
  const [openDialog, setOpenDialog] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [openPassword, setOpenPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const fetchProjects = () => {
    setLoading(true);
    listFn()
      .then(setProjects)
      .catch((err) => toast.error(`Failed to load projects: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleOpenProject = (email: string, name: string) => {
    setOpenPassword("");
    setOpenDialog({ email, name });
  };

  const handleSignIn = async () => {
    if (!openDialog) return;
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: openDialog.email,
      password: openPassword,
    });
    setSigningIn(false);
    if (error) {
      toast.error(`Sign in failed: ${error.message}`);
      return;
    }
    toast.success(`Signed in as ${openDialog.email}`);
    setOpenDialog(null);
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All client organisations managed through this consultant account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProjects} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link to="/master/new-project">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create your first project to get started.</p>
          <Button asChild className="mt-4" size="sm">
            <Link to="/master/new-project">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{project.name}</h2>
                    {project.industry && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {project.industry}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium">{project.total_people}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                {/* Leaders */}
                <div className="flex-1 space-y-2">
                  {project.leaders.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No CEO or HR Rep assigned</p>
                  ) : (
                    project.leaders.map((leader) => (
                      <div key={leader.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {leader.first_name} {leader.last_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{leader.email}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {leader.roles.map((role) => (
                            <span
                              key={role}
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLOURS[role] ?? "bg-muted text-muted-foreground"}`}
                            >
                              {ROLE_LABELS[role] ?? role}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Open buttons — one per leader */}
                {project.leaders.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {project.leaders.map((leader) => (
                      <Button
                        key={leader.id}
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => handleOpenProject(leader.email ?? "", `${leader.first_name} ${leader.last_name}`)}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open as {leader.first_name}
                      </Button>
                    ))}
                  </div>
                )}

                {project.leaders.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Create a CEO or HR Rep user to access this project.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sign-in dialog */}
      <Dialog open={!!openDialog} onOpenChange={(o) => { if (!o && !signingIn) setOpenDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Sign in to project
            </DialogTitle>
            <DialogDescription>
              Enter the password for <span className="font-medium text-foreground">{openDialog?.name}</span>
              {" "}({openDialog?.email}) to open this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="open-password">Password</Label>
            <Input
              id="open-password"
              type="password"
              value={openPassword}
              onChange={(e) => setOpenPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSignIn(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)} disabled={signingIn}>
              Cancel
            </Button>
            <Button onClick={() => void handleSignIn()} disabled={signingIn || !openPassword}>
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              Open Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
