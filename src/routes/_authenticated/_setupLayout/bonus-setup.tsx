import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  ListChecks,
  Trash2,
  ArrowRight,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddBonusSchemeModal } from "@/components/bonus/AddBonusSchemeModal";
import {
  AddBonusTierModal,
  type ExistingTier,
} from "@/components/bonus/AddBonusTierModal";
import {
  AssignBonusModal,
  type AssignTarget,
  type BonusSchemeOption,
} from "@/components/bonus/AssignBonusModal";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute(
  "/_authenticated/_setupLayout/bonus-setup",
)({
  component: BonusSetupPage,
});

// ─── Shared types ─────────────────────────────────────────────────────────────

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_LABEL: Record<UserRole, string> = {
  ceo: "CEO",
  manager: "Manager",
  hr_rep: "HR Rep",
  employee: "Employee",
};

// ─── Bonus Schemes section types ──────────────────────────────────────────────

type SchemeRow = {
  id: string;
  name: string;
  description: string | null;
  tier_count: number;
};

type TierRow = ExistingTier & {
  bonus_pct_of_salary: number;
};

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n}%`;
}

// ─── Bonus Assignments section types ──────────────────────────────────────────

type PersonRow = {
  person_id: string;
  full_name: string;
  roles: UserRole[];
  scheme_id: string | null;
  scheme_name: string | null;
  midyear_eligible: boolean;
  yearend_eligible: boolean;
};

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "default" : "secondary"}>
      {value ? "Yes" : "No"}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function BonusSetupPage() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();

  const isCeo = roles.includes("ceo");

  // ── Schemes state ────────────────────────────────────────────────────────────
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(true);
  const [addSchemeOpen, setAddSchemeOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tiersByScheme, setTiersByScheme] = useState<Record<string, TierRow[]>>(
    {},
  );
  const [tiersLoading, setTiersLoading] = useState<Record<string, boolean>>({});
  const [tierModalScheme, setTierModalScheme] = useState<string | null>(null);
  const [tierToDelete, setTierToDelete] = useState<{
    id: string;
    schemeId: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Assignments state ────────────────────────────────────────────────────────
  const [personRows, setPersonRows] = useState<PersonRow[]>([]);
  const [schemeOptions, setSchemeOptions] = useState<BonusSchemeOption[]>([]);
  const [assignLoading, setAssignLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  // ── Completing setup ─────────────────────────────────────────────────────────
  const [completing, setCompleting] = useState(false);

  // ── Load schemes ─────────────────────────────────────────────────────────────
  const loadSchemes = useCallback(async () => {
    if (!entity_id) return;
    setSchemesLoading(true);
    const { data, error } = await supabase
      .from("bonus_schemes")
      .select("id, name, description, bonus_scheme_tiers(id)")
      .eq("entity_id", entity_id)
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load bonus schemes.");
      setSchemes([]);
    } else {
      setSchemes(
        (data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          tier_count: Array.isArray(s.bonus_scheme_tiers)
            ? s.bonus_scheme_tiers.length
            : 0,
        })),
      );
    }
    setSchemesLoading(false);
  }, [entity_id]);

  // ── Load tiers ───────────────────────────────────────────────────────────────
  const loadTiers = useCallback(async (schemeId: string) => {
    setTiersLoading((p) => ({ ...p, [schemeId]: true }));
    const { data, error } = await supabase
      .from("bonus_scheme_tiers")
      .select("id, threshold_min_pct, threshold_max_pct, bonus_pct_of_salary")
      .eq("bonus_scheme_id", schemeId)
      .order("threshold_min_pct", { ascending: true });

    if (error) {
      toast.error("Failed to load tiers.");
      setTiersByScheme((p) => ({ ...p, [schemeId]: [] }));
    } else {
      setTiersByScheme((p) => ({
        ...p,
        [schemeId]: (data ?? []).map((t) => ({
          id: t.id,
          threshold_min_pct: Number(t.threshold_min_pct),
          threshold_max_pct:
            t.threshold_max_pct === null ? null : Number(t.threshold_max_pct),
          bonus_pct_of_salary: Number(t.bonus_pct_of_salary),
        })),
      }));
    }
    setTiersLoading((p) => ({ ...p, [schemeId]: false }));
  }, []);

  const toggleExpand = (schemeId: string) => {
    const next = !expanded[schemeId];
    setExpanded((p) => ({ ...p, [schemeId]: next }));
    if (next && !tiersByScheme[schemeId]) {
      void loadTiers(schemeId);
    }
  };

  const refreshTiersAndCount = async (schemeId: string) => {
    await loadTiers(schemeId);
    void loadSchemes();
  };

  const handleConfirmDeleteTier = async () => {
    if (!tierToDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("bonus_scheme_tiers")
      .delete()
      .eq("id", tierToDelete.id);
    setDeleting(false);

    if (error) {
      toast.error("Failed to delete tier.");
      return;
    }
    toast.success("Tier deleted.");
    const schemeId = tierToDelete.schemeId;
    setTierToDelete(null);
    await refreshTiersAndCount(schemeId);
  };

  // ── Load assignments ──────────────────────────────────────────────────────────
  const loadAssignments = useCallback(async () => {
    if (!entity_id || !person?.id) return;
    setAssignLoading(true);

    const [peopleRes, schemesRes] = await Promise.all([
      supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("entity_id", entity_id)
        .eq("is_active", true)
        .order("last_name", { ascending: true }),
      supabase
        .from("bonus_schemes")
        .select("id, name")
        .eq("entity_id", entity_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (peopleRes.error) {
      toast.error("Failed to load people.");
      setPersonRows([]);
      setAssignLoading(false);
      return;
    }

    const people = peopleRes.data ?? [];
    const ids = people.map((p) => p.id);
    setSchemeOptions(schemesRes.data ?? []);

    if (ids.length === 0) {
      setPersonRows([]);
      setAssignLoading(false);
      return;
    }

    const [rolesRes, assignRes] = await Promise.all([
      supabase.from("people_roles").select("person_id, role").in("person_id", ids),
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
      { scheme_id: string | null; scheme_name: string | null; midyear: boolean; yearend: boolean }
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

    setPersonRows(
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
    setAssignLoading(false);
  }, [entity_id, person?.id, selected_year]);

  useEffect(() => {
    if (isCeo && entity_id) {
      void loadSchemes();
      void loadAssignments();
    }
  }, [isCeo, entity_id, loadSchemes, loadAssignments]);

  const headerYear = useMemo(() => selected_year, [selected_year]);

  // ── Complete Setup ────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!entity_id) return;
    setCompleting(true);
    try {
      const { error } = await supabase.from("setup_progress").upsert(
        {
          entity_id,
          step_key: "assign_bonus_schemes",
          status: "complete",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_id,step_key" },
      );
      if (error) {
        toast.error(`Failed to mark complete: ${error.message}`);
        return;
      }
      await navigate({ to: "/setup" });
    } finally {
      setCompleting(false);
    }
  };

  if (!isCeo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only the CEO can manage bonus setup.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Section A: Bonus Schemes ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Bonus Schemes</h2>
            <p className="text-sm text-muted-foreground">
              Define bonus schemes used to reward KPI performance.
            </p>
          </div>
          <Button onClick={() => setAddSchemeOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Bonus Scheme
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            {schemesLoading ? (
              <div className="flex items-center justify-center py-5">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : schemes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No bonus schemes yet. Click "Create Bonus Scheme" to create one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24 text-center">Tiers</TableHead>
                    <TableHead className="w-56 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemes.map((s) => {
                    const isOpen = !!expanded[s.id];
                    const tiers = tiersByScheme[s.id] ?? [];
                    const isTiersLoading = !!tiersLoading[s.id];
                    return (
                      <Fragment key={s.id}>
                        <TableRow>
                          <TableCell className="p-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpand(s.id)}
                              aria-label={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{s.tier_count}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setEditingScheme({
                                    id: s.id,
                                    name: s.name,
                                    description: s.description,
                                  })
                                }
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (!isOpen) toggleExpand(s.id);
                                  else if (!tiersByScheme[s.id])
                                    void loadTiers(s.id);
                                }}
                              >
                                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                                View Tiers
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={5} className="p-4">
                              <div className="flex items-center justify-between pb-3">
                                <h3 className="text-sm font-semibold">
                                  Tiers for {s.name}
                                </h3>
                                <Button
                                  size="sm"
                                  onClick={() => setTierModalScheme(s.id)}
                                >
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Add Tier
                                </Button>
                              </div>

                              {isTiersLoading ? (
                                <div className="flex items-center justify-center py-6">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              ) : tiers.length === 0 ? (
                                <p className="py-4 text-center text-sm text-muted-foreground">
                                  No tiers defined yet.
                                </p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Min Achievement %</TableHead>
                                      <TableHead>Max Achievement %</TableHead>
                                      <TableHead>Bonus % of Salary</TableHead>
                                      <TableHead className="w-24 text-right">
                                        Actions
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {tiers.map((t) => (
                                      <TableRow key={t.id}>
                                        <TableCell>
                                          {formatPct(t.threshold_min_pct)}
                                        </TableCell>
                                        <TableCell>
                                          {t.threshold_max_pct === null
                                            ? "and above"
                                            : formatPct(t.threshold_max_pct)}
                                        </TableCell>
                                        <TableCell>
                                          {formatPct(t.bonus_pct_of_salary)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() =>
                                              setTierToDelete({
                                                id: t.id,
                                                schemeId: s.id,
                                              })
                                            }
                                            aria-label="Delete tier"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section B: Bonus Assignments ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Assign Schemes to Employees
            </h2>
            <p className="text-sm text-muted-foreground">
              Assign bonus schemes and eligibility for {headerYear}.
            </p>
          </div>
          <Badge variant="secondary">Year: {headerYear}</Badge>
        </div>

        <Card>
          <CardContent className="pt-4">
            {assignLoading ? (
              <div className="flex items-center justify-center py-5">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : personRows.length === 0 ? (
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
                  {personRows.map((r) => (
                    <TableRow key={r.person_id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.roles.length === 0 ? (
                            <span className="text-sm text-muted-foreground">—</span>
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
                          onClick={() =>
                            setAssignTarget({
                              person_id: r.person_id,
                              full_name: r.full_name,
                              current_scheme_id: r.scheme_id,
                              midyear_eligible: r.midyear_eligible,
                              yearend_eligible: r.yearend_eligible,
                            })
                          }
                          disabled={schemeOptions.length === 0}
                          title={
                            schemeOptions.length === 0
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
      </div>

      {/* ── Complete Setup button ─────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={handleComplete} disabled={completing} size="lg">
          {completing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          Complete Setup
        </Button>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {entity_id && (
        <AddBonusSchemeModal
          open={addSchemeOpen}
          onOpenChange={setAddSchemeOpen}
          entityId={entity_id}
          onCreated={() => {
            void loadSchemes();
            void loadAssignments();
          }}
        />
      )}

      {entity_id && (
        <AddBonusSchemeModal
          open={editingScheme !== null}
          onOpenChange={(o) => {
            if (!o) setEditingScheme(null);
          }}
          entityId={entity_id}
          editing={editingScheme ?? undefined}
          onCreated={() => {}}
          onUpdated={() => {
            setEditingScheme(null);
            void loadSchemes();
          }}
        />
      )}

      {tierModalScheme && (
        <AddBonusTierModal
          open={!!tierModalScheme}
          onOpenChange={(o) => {
            if (!o) setTierModalScheme(null);
          }}
          schemeId={tierModalScheme}
          existingTiers={tiersByScheme[tierModalScheme] ?? []}
          onCreated={() => {
            const id = tierModalScheme;
            setTierModalScheme(null);
            if (id) void refreshTiersAndCount(id);
          }}
        />
      )}

      {entity_id && (
        <AssignBonusModal
          open={!!assignTarget}
          onOpenChange={(o) => {
            if (!o) setAssignTarget(null);
          }}
          entityId={entity_id}
          year={selected_year}
          schemes={schemeOptions}
          target={assignTarget}
          onSaved={() => {
            void loadAssignments();
          }}
        />
      )}

      <AlertDialog
        open={!!tierToDelete}
        onOpenChange={(o) => {
          if (!o && !deleting) setTierToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the tier from the scheme. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDeleteTier();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
