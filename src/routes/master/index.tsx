import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, ExternalLink, Shield, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { masterListProjects, type ProjectSummary } from "@/integrations/supabase/master.functions";
import { supabase } from "@/integrations/supabase/client";
import { useMasterAuth } from "@/contexts/MasterAuthContext";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const { masterSignOut } = useMasterAuth();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

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
    masterSignOut();
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
    navigate({ to: "/", replace: true });
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Admin Users</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Departments</TableHead>
                <TableHead className="text-right">KPIs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    {project.industry ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {project.leaders.length === 0 ? (
                      <span className="text-xs italic text-muted-foreground">No CEO or HR Rep assigned</span>
                    ) : (
                      <div className="space-y-1.5">
                        {project.leaders.map((leader) => (
                          <div key={leader.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {leader.first_name} {leader.last_name}
                            </span>
                            {leader.roles.map((role) => (
                              <span
                                key={role}
                                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLOURS[role] ?? "bg-muted text-muted-foreground"}`}
                              >
                                {ROLE_LABELS[role] ?? role}
                              </span>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 gap-1 px-2 text-xs"
                              onClick={() => handleOpenProject(leader.email ?? "", `${leader.first_name} ${leader.last_name}`)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open as {leader.first_name}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{project.total_people}</TableCell>
                  <TableCell className="text-right">{project.org_department_count}</TableCell>
                  <TableCell className="text-right">{project.total_kpi_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
