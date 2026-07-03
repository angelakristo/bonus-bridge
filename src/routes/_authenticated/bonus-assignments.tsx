import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AssignBonusModal,
  type AssignTarget,
  type BonusSchemeOption,
} from "@/components/bonus/AssignBonusModal";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/bonus-assignments")({
  component: BonusAssignmentsPage,
});

type UserRole = Database["public"]["Enums"]["user_role"];

type PersonRow = {
  person_id: string;
  full_name: string;
  roles: UserRole[];
  scheme_id: string | null;
  scheme_name: string | null;
  midyear_eligible: boolean;
  yearend_eligible: boolean;
};

const ROLE_LABEL: Record<UserRole, string> = {
  ceo: "CEO",
  manager: "Manager",
  hr_rep: "HR Rep",
  employee: "Employee",
};

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "default" : "secondary"}>
      {value ? "Yes" : "No"}
    </Badge>
  );
}

function BonusAssignmentsPage() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const isCeo = roles.includes("ceo");
  const isManager = roles.includes("manager");
  const allowed = isCeo || isManager;

  const [rows, setRows] = useState<PersonRow[]>([]);
  const [schemes, setSchemes] = useState<BonusSchemeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AssignTarget | null>(null);

  const load = useCallback(async () => {
    if (!entity_id || !person?.id) return;
    setLoading(true);

    let personIds: string[] | null = null;
    if (!isCeo) {
      const { data: myDepts } = await supabase
        .from("people_org_departments")
        .select("org_department_id")
        .eq("person_id", person.id);
      const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
      if (deptIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data: peers } = await supabase
        .from("people_org_departments")
        .select("person_id")
        .in("org_department_id", deptIds);
      personIds = Array.from(new Set((peers ?? []).map((p) => p.person_id)));
    }

    let pq = supabase
      .from("people")
      .select("id, first_name, last_name")
      .eq("entity_id", entity_id)
      .eq("is_active", true)
      .order("last_name", { ascending: true });
    if (personIds) pq = pq.in("id", personIds);

    const [peopleRes, schemesRes] = await Promise.all([
      pq,
      supabase
        .from("bonus_schemes")
        .select("id, name")
        .eq("entity_id", entity_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (peopleRes.error) {
      console.error("[BonusAssignments] load people failed", peopleRes.error);
      toast.error("Failed to load people.");
      setRows([]);
      setLoading(false);
      return;
    }

    const people = peopleRes.data ?? [];
    const ids = people.map((p) => p.id);
    setSchemes(schemesRes.data ?? []);

    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [rolesRes, assignRes] = await Promise.all([
      supabase
        .from("people_roles")
        .select("person_id, role")
        .in("person_id", ids),
      supabase
        .from("employee_bonus_assignments")
        .select(
          "person_id, bonus_scheme_id, midyear_bonus_eligible, yearend_bonus_eligible, bonus_schemes(name)",
        )
        .eq("entity_id", entity_id)
        .eq("year", selected_year)
        .in("person_id", ids),
    ]);

    const rolesByPerson = new Map<string, UserRole[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesByPerson.get(r.person_id) ?? [];
      list.push(r.role);
      rolesByPerson.set(r.person_id, list);
    }

    const assignByPerson = new Map<
      string,
      {
        scheme_id: string | null;
        scheme_name: string | null;
        midyear: boolean;
        yearend: boolean;
      }
    >();
    for (const a of assignRes.data ?? []) {
      const def = a.bonus_schemes as { name: string } | null;
      assignByPerson.set(a.person_id, {
        scheme_id: a.bonus_scheme_id,
        scheme_name: def?.name ?? null,
        midyear: !!a.midyear_bonus_eligible,
        yearend: !!a.yearend_bonus_eligible,
      });
    }

    setRows(
      people.map((p) => {
        const a = assignByPerson.get(p.id);
        return {
          person_id: p.id,
          full_name: `${p.first_name} ${p.last_name}`,
          roles: rolesByPerson.get(p.id) ?? [],
          scheme_id: a?.scheme_id ?? null,
          scheme_name: a?.scheme_name ?? null,
          midyear_eligible: a?.midyear ?? false,
          yearend_eligible: a?.yearend ?? true,
        };
      }),
    );
    setLoading(false);
  }, [entity_id, person?.id, isCeo, selected_year]);

  useEffect(() => {
    if (allowed && entity_id && person?.id) void load();
  }, [allowed, entity_id, person?.id, load]);

  const openAssign = (r: PersonRow) => {
    setTarget({
      person_id: r.person_id,
      full_name: r.full_name,
      current_scheme_id: r.scheme_id,
      midyear_eligible: r.midyear_eligible,
      yearend_eligible: r.yearend_eligible,
    });
  };

  const headerYear = useMemo(() => selected_year, [selected_year]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Bonus Assignment
          </h1>
          <p className="text-sm text-muted-foreground">
            Assign bonus schemes and eligibility for {headerYear}.
          </p>
        </div>
        <Badge variant="secondary">Year: {headerYear}</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-5">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No people available.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Current Bonus Scheme</TableHead>
                  <TableHead className="text-center">H1</TableHead>
                  <TableHead className="text-center">Full Year</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.person_id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.roles.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : (
                          r.roles.map((rl) => (
                            <Badge key={rl} variant="outline">
                              {ROLE_LABEL[rl]}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.scheme_name ?? (
                        <span className="text-sm text-muted-foreground">
                          Not assigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <YesNo value={r.midyear_eligible && !!r.scheme_id} />
                    </TableCell>
                    <TableCell className="text-center">
                      <YesNo value={r.yearend_eligible && !!r.scheme_id} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssign(r)}
                        disabled={schemes.length === 0}
                        title={
                          schemes.length === 0
                            ? "Create a bonus scheme first"
                            : undefined
                        }
                      >
                        Assign
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
        <AssignBonusModal
          open={!!target}
          onOpenChange={(o) => {
            if (!o) setTarget(null);
          }}
          entityId={entity_id}
          year={selected_year}
          schemes={schemes}
          target={target}
          onSaved={load}
        />
      )}
    </div>
  );
}
