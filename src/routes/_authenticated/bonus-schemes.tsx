import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, ListChecks } from "lucide-react";
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
import { AddBonusSchemeModal } from "@/components/bonus/AddBonusSchemeModal";

export const Route = createFileRoute("/_authenticated/bonus-schemes")({
  component: BonusSchemesPage,
});

type SchemeRow = {
  id: string;
  name: string;
  description: string | null;
  tier_count: number;
};

function BonusSchemesPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const isCeo = roles.includes("ceo");

  const [rows, setRows] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
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
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-center">Tiers</TableHead>
                  <TableHead className="w-56 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
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
                          onClick={() =>
                            toast.info("View tiers — coming soon.")
                          }
                        >
                          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                          View Tiers
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
    </div>
  );
}
