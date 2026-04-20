import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  ApproveKpiModal,
  type ApprovalAction,
} from "@/components/kpi/ApproveKpiModal";

type Search = { person_id?: string };

export const Route = createFileRoute("/_authenticated/kpi-approvals")({
  component: KpiApprovalsPage,
  validateSearch: (search: Record<string, unknown>): Search => ({
    person_id:
      typeof search.person_id === "string" ? search.person_id : undefined,
  }),
});

type PendingRow = {
  individual_kpi_id: string;
  person_id: string;
  employee_name: string;
  kpi_title: string;
  kpi_type: "progressive" | "binary" | "benchmark";
  driver: "growth" | "efficiency" | "culture";
  unit: string | null;
  yearend_target: string;
};

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

function KpiApprovalsPage() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();
  const { person_id: filterPersonId } = Route.useSearch();

  const isCeo = roles.some((r) => r === "ceo");
  const isManager = roles.some((r) => r === "manager");
  const allowed = isCeo || isManager;

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ApprovalAction>("approve");
  const [activeRow, setActiveRow] = useState<PendingRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !entity_id || !person?.id) return;
    setLoading(true);

    // Determine scope of person_ids the user can review.
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
      personIds = Array.from(
        new Set((peers ?? []).map((p) => p.person_id)),
      ).filter((id) => id !== person.id);
      if (personIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from("individual_kpis")
      .select(
        "id, person_id, kpi_definitions(title, kpi_type, driver, unit), people:person_id(first_name, last_name)",
      )
      .eq("entity_id", entity_id)
      .eq("year", selected_year)
      .eq("status", "pending_approval");

    if (personIds) query = query.in("person_id", personIds);
    if (filterPersonId) query = query.eq("person_id", filterPersonId);

    const { data, error } = await query;
    if (error) {
      console.error("[KpiApprovals] load failed", error);
      toast.error("Failed to load pending KPIs.");
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = (data ?? []).map((r) => r.id);
    const targetsMap = new Map<string, { value: number | null; binary: boolean | null }>();
    if (ids.length > 0) {
      const { data: targets } = await supabase
        .from("individual_kpi_targets")
        .select("individual_kpi_id, target_value, target_binary")
        .in("individual_kpi_id", ids)
        .eq("period", "fullyear");
      for (const t of targets ?? []) {
        targetsMap.set(t.individual_kpi_id, {
          value: t.target_value,
          binary: t.target_binary,
        });
      }
    }

    const mapped: PendingRow[] = (data ?? []).map((r) => {
      const def = r.kpi_definitions as unknown as {
        title: string;
        kpi_type: PendingRow["kpi_type"];
        driver: PendingRow["driver"];
        unit: string | null;
      } | null;
      const p = r.people as unknown as {
        first_name: string;
        last_name: string;
      } | null;
      const t = targetsMap.get(r.id);
      let yearend = "—";
      if (def?.kpi_type === "binary") {
        yearend =
          t?.binary === true ? "✓ Achieved" : t?.binary === false ? "✗ Not" : "—";
      } else if (t?.value != null) {
        yearend = `${t.value}${def?.unit ? ` ${def.unit}` : ""}`;
      }
      return {
        individual_kpi_id: r.id,
        person_id: r.person_id ?? "",
        employee_name: p ? `${p.first_name} ${p.last_name}` : "Unknown",
        kpi_title: def?.title ?? "Untitled KPI",
        kpi_type: def?.kpi_type ?? "progressive",
        driver: def?.driver ?? "growth",
        unit: def?.unit ?? null,
        yearend_target: yearend,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [allowed, entity_id, person?.id, selected_year, isCeo, filterPersonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAction = (row: PendingRow, action: ApprovalAction) => {
    setActiveRow(row);
    setModalAction(action);
    setModalOpen(true);
  };

  const handleConfirm = async (note: string) => {
    if (!activeRow || !person?.id) return;
    setSubmitting(true);
    const newStatus = modalAction === "approve" ? "approved" : "rejected";
    const { error } = await supabase
      .from("individual_kpis")
      .update({
        status: newStatus,
        approved_by: person.id,
        approval_note: note.length > 0 ? note : null,
      })
      .eq("id", activeRow.individual_kpi_id);

    setSubmitting(false);

    if (error) {
      console.error("[KpiApprovals] update failed", error);
      toast.error(`Failed to ${modalAction} KPI.`);
      return;
    }

    toast.success(
      modalAction === "approve" ? "KPI approved." : "KPI rejected.",
    );
    setRows((prev) =>
      prev.filter((r) => r.individual_kpi_id !== activeRow.individual_kpi_id),
    );
    setModalOpen(false);
    setActiveRow(null);
    // Refresh Action Centre badge across the app.
    window.dispatchEvent(new Event("action-centre:refresh"));
  };

  const headerCount = useMemo(() => rows.length, [rows]);

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KPI Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review individual KPIs submitted for approval.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Pending review {headerCount > 0 && `(${headerCount})`}
          </CardTitle>
          {filterPersonId && (
            <Badge variant="secondary">Filtered to one employee</Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No KPIs pending your approval.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Year-End Target</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const ds = DRIVER_STYLE[row.driver];
                    return (
                      <TableRow key={row.individual_kpi_id}>
                        <TableCell className="font-medium">
                          {row.employee_name}
                        </TableCell>
                        <TableCell>{row.kpi_title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {TYPE_LABEL[row.kpi_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("border-0", ds.bg, ds.text)}
                          >
                            {ds.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.unit ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.yearend_target}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAction(row, "approve")}
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openAction(row, "reject")}
                            >
                              <X className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ApproveKpiModal
        open={modalOpen}
        onOpenChange={(o) => {
          if (!submitting) setModalOpen(o);
        }}
        action={modalAction}
        kpiTitle={activeRow?.kpi_title ?? ""}
        employeeName={activeRow?.employee_name ?? ""}
        submitting={submitting}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
