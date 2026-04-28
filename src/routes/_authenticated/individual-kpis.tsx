import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, Send } from "lucide-react";
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
import { AddKpiModal } from "@/components/kpi/AddKpiModal";
import {
  KpiDetailModal,
  type IndividualKpiDetail,
} from "@/components/kpi/KpiDetailModal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/individual-kpis")({
  component: IndividualKpiProposalPage,
});

type Status = "draft" | "pending_approval" | "approved" | "rejected";

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth: { bg: "bg-green-100", text: "text-green-800", label: "Growth" },
  efficiency: { bg: "bg-blue-100", text: "text-blue-800", label: "Efficiency" },
  culture: { bg: "bg-amber-100", text: "text-amber-800", label: "Culture" },
};

const TYPE_LABEL: Record<string, string> = {
  progressive: "Progressive",
  binary: "Binary",
  benchmark: "Benchmark",
};

const STATUS_STYLE: Record<Status, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", label: "Draft" },
  pending_approval: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending Approval" },
  approved: { bg: "bg-green-100", text: "text-green-800", label: "Approved" },
  rejected: { bg: "bg-red-100", text: "text-red-800", label: "Rejected" },
};

function ApprovalStatusChip({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <Badge variant="outline" className={cn("border-0 font-medium", s.bg, s.text)}>
      {s.label}
    </Badge>
  );
}

function IndividualKpiProposalPage() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();

  const allowed = roles.some((r) => r === "employee");

  const [rows, setRows] = useState<IndividualKpiDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailKpi, setDetailKpi] = useState<IndividualKpiDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!entity_id || !person?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("individual_kpis")
      .select(
        "id, status, approval_note, kpi_definitions(id, title, description, driver, kpi_type, unit)",
      )
      .eq("entity_id", entity_id)
      .eq("person_id", person.id)
      .eq("year", selected_year)
      .eq("is_active", true)
      .order("display_order");

    if (error) {
      console.error("[IndividualKpis] load failed", error);
      toast.error("Failed to load KPIs.");
      setLoading(false);
      return;
    }

    const mapped: IndividualKpiDetail[] = (data ?? [])
      .map((r) => {
        const def = r.kpi_definitions as unknown as {
          id: string;
          title: string;
          description: string | null;
          driver: IndividualKpiDetail["driver"];
          kpi_type: IndividualKpiDetail["kpi_type"];
          unit: string | null;
        } | null;
        if (!def) return null;
        return {
          individual_kpi_id: r.id,
          title: def.title,
          description: def.description,
          driver: def.driver,
          kpi_type: def.kpi_type,
          unit: def.unit,
          status: r.status as Status,
          approval_note: (r as { approval_note?: string | null }).approval_note ?? null,
        };
      })
      .filter((r): r is IndividualKpiDetail => r !== null);

    setRows(mapped);
    setLoading(false);
  }, [entity_id, person?.id, selected_year]);

  useEffect(() => {
    if (!allowed) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    void load();
  }, [allowed, load, navigate]);

  const draftCount = rows.filter((r) => r.status === "draft").length;

  const handleSubmitDrafts = async () => {
    if (!entity_id || !person?.id || draftCount === 0) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("individual_kpis")
      .update({ status: "pending_approval" })
      .eq("entity_id", entity_id)
      .eq("person_id", person.id)
      .eq("year", selected_year)
      .eq("status", "draft");
    setSubmitting(false);
    if (error) {
      console.error("[IndividualKpis] submit drafts", error);
      toast.error("Failed to submit drafts.");
      return;
    }
    toast.success(`Submitted ${draftCount} KPI${draftCount === 1 ? "" : "s"} for approval.`);
    void load();
  };

  if (!allowed) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">My KPI Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Propose your individual KPIs for {selected_year} and submit them for approval.
          </p>
        </div>
        <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">{selected_year}</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Individual KPIs ({rows.length})
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSubmitDrafts}
                disabled={draftCount === 0 || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit All Drafts for Approval
                {draftCount > 0 && ` (${draftCount})`}
              </Button>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Propose KPI
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No KPIs proposed yet. Click <span className="font-medium">Propose KPI</span> to add one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI Title</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ds = DRIVER_STYLE[r.driver];
                  return (
                    <TableRow key={r.individual_kpi_id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border-0", ds.bg, ds.text)}>
                          {ds.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TYPE_LABEL[r.kpi_type]}</Badge>
                      </TableCell>
                      <TableCell>
                        <ApprovalStatusChip status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailKpi(r)}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddKpiModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        level="individual"
        person_id={person?.id ?? null}
        onSuccess={() => {
          void load();
        }}
      />

      <KpiDetailModal
        open={detailKpi !== null}
        onOpenChange={(open) => {
          if (!open) setDetailKpi(null);
        }}
        kpi={detailKpi}
      />
    </div>
  );
}
