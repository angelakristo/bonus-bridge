import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RoleChip, type UserRole } from "@/components/role-assignment/RoleChip";
import { EditRolesModal } from "@/components/role-assignment/EditRolesModal";

export const Route = createFileRoute("/_authenticated/_setupLayout/role-assignment")({
  component: RoleAssignmentPage,
});

type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  roles: UserRole[];
};

function RoleAssignmentPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entity_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("people")
      .select("id, first_name, last_name, email, people_roles(role)")
      .eq("entity_id", entity_id)
      .eq("is_active", true)
      .order("last_name", { ascending: true });

    if (error) {
      console.error("[role-assignment] load failed", error);
      setPeople([]);
    } else {
      setPeople(
        (data ?? []).map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          roles: (p.people_roles ?? []).map((r) => r.role) as UserRole[],
        })),
      );
    }
    setLoading(false);
  }, [entity_id]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const editingPerson = useMemo(
    () => people.find((p) => p.id === editingId) ?? null,
    [people, editingId],
  );

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            Role assignment is only available to CEO and HR Rep users.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Assign Roles</h1>
        <p className="text-muted-foreground text-sm">
          Manage which roles each person holds. A person must always have at least one role.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : people.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No employees yet.{" "}
              <Link to="/employee-upload" className="text-primary underline">
                Upload your roster first
              </Link>
              .
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Roles</TableHead>
                  <TableHead className="w-24 text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.first_name} {p.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      {p.roles.length === 0 ? (
                        <span className="text-muted-foreground text-sm">No roles</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {p.roles.map((r) => (
                            <RoleChip key={r} role={r} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(p.id)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {entity_id && (
        <EditRolesModal
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          person={editingPerson}
          currentRoles={editingPerson?.roles ?? []}
          entity_id={entity_id}
          onSaved={load}
        />
      )}
    </div>
  );
}
