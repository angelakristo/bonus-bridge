import { useCallback, useEffect, useState, Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  ListChecks,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
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

export const Route = createFileRoute("/_authenticated/bonus-schemes")({
  component: BonusSchemesPage,
});

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

function BonusSchemesPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const isCeo = roles.includes("ceo");

  const [rows, setRows] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Per-scheme tier state
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

  const load = useCallback(async () => {
    if (!entity_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bonus_schemes")
      .select("id, name, description, bonus_scheme_tiers(id)")
      .eq("entity_id", entity_id)
      .order("name", { ascending: true });

    if (error) {
      console.error("[BonusSchemes] load failed", error);
      toast.error("Failed to load bonus schemes.");
      setRows([]);
    } else {
      setRows(
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
    setLoading(false);
  }, [entity_id]);

  useEffect(() => {
    if (isCeo && entity_id) void load();
  }, [isCeo, entity_id, load]);

  const loadTiers = useCallback(async (schemeId: string) => {
    setTiersLoading((p) => ({ ...p, [schemeId]: true }));
    const { data, error } = await supabase
      .from("bonus_scheme_tiers")
      .select("id, threshold_min_pct, threshold_max_pct, bonus_pct_of_salary")
      .eq("bonus_scheme_id", schemeId)
      .order("threshold_min_pct", { ascending: true });

    if (error) {
      console.error("[BonusSchemes] load tiers failed", error);
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
    void load();
  };

  const handleConfirmDelete = async () => {
    if (!tierToDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("bonus_scheme_tiers")
      .delete()
      .eq("id", tierToDelete.id);
    setDeleting(false);

    if (error) {
      console.error("[BonusSchemes] delete tier failed", error);
      toast.error("Failed to delete tier.");
      return;
    }
    toast.success("Tier deleted.");
    const schemeId = tierToDelete.schemeId;
    setTierToDelete(null);
    await refreshTiersAndCount(schemeId);
  };

  if (!isCeo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only the CEO can manage bonus schemes.
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
            Bonus Scheme Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Define bonus schemes used to reward KPI performance.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Bonus Scheme
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bonus Schemes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bonus schemes yet. Click "Add Bonus Scheme" to create one.
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
                {rows.map((s) => {
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
                                toast.info("Edit scheme — coming soon.")
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

      {entity_id && (
        <AddBonusSchemeModal
          open={addOpen}
          onOpenChange={setAddOpen}
          entityId={entity_id}
          onCreated={load}
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
                void handleConfirmDelete();
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
