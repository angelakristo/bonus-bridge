import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Plus, Library, Building2, Briefcase, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KpiCard, type KpiCardData } from "@/components/kpi/KpiCard";
import { AddKpiModal, type KpiLevel } from "@/components/kpi/AddKpiModal";

export const Route = createFileRoute("/_authenticated/kpi-board")({
  component: KpiBoardPage,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OrgDept = { id: string; name: string };

/* ------------------------------------------------------------------ */
/*  Data-fetching helpers                                              */
/* ------------------------------------------------------------------ */

async function fetchLibrary(entityId: string, year: number): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("kpi_definitions")
    .select("id, title, driver, kpi_type, unit")
    .eq("entity_id", entityId)
    .eq("year", year)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    yearend_target_value: null,
    yearend_target_binary: null,
  }));
}

async function fetchCorporateKpis(entityId: string, year: number): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("corporate_kpis")
    .select("id, display_order, kpi_definition_id, kpi_definitions(id, title, driver, kpi_type, unit)")
    .eq("entity_id", entityId)
    .eq("year", year)
    .order("display_order");
  if (error) throw error;

  const cards: KpiCardData[] = [];
  for (const row of data ?? []) {
    const def = row.kpi_definitions as unknown as {
      id: string; title: string; driver: string; kpi_type: string; unit: string | null;
    } | null;
    if (!def) continue;

    // fetch year-end target
    const { data: tgt } = await supabase
      .from("corporate_kpi_targets")
      .select("target_value, target_binary")
      .eq("corporate_kpi_id", row.id)
      .eq("period", "fullyear")
      .maybeSingle();

    cards.push({
      id: def.id,
      title: def.title,
      driver: def.driver as KpiCardData["driver"],
      kpi_type: def.kpi_type as KpiCardData["kpi_type"],
      unit: def.unit,
      yearend_target_value: tgt?.target_value ?? null,
      yearend_target_binary: tgt?.target_binary ?? null,
    });
  }
  return cards;
}

async function fetchDepartmentKpis(
  entityId: string,
  year: number,
  orgDeptId: string,
): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("department_kpis")
    .select("id, display_order, kpi_definition_id, kpi_definitions(id, title, driver, kpi_type, unit)")
    .eq("entity_id", entityId)
    .eq("year", year)
    .eq("org_department_id", orgDeptId)
    .order("display_order");
  if (error) throw error;

  const cards: KpiCardData[] = [];
  for (const row of data ?? []) {
    const def = row.kpi_definitions as unknown as {
      id: string; title: string; driver: string; kpi_type: string; unit: string | null;
    } | null;
    if (!def) continue;

    const { data: tgt } = await supabase
      .from("department_kpi_targets")
      .select("target_value, target_binary")
      .eq("department_kpi_id", row.id)
      .eq("period", "fullyear")
      .maybeSingle();

    cards.push({
      id: def.id,
      title: def.title,
      driver: def.driver as KpiCardData["driver"],
      kpi_type: def.kpi_type as KpiCardData["kpi_type"],
      unit: def.unit,
      yearend_target_value: tgt?.target_value ?? null,
      yearend_target_binary: tgt?.target_binary ?? null,
    });
  }
  return cards;
}

async function fetchOrgDepts(entityId: string): Promise<OrgDept[]> {
  const { data, error } = await supabase
    .from("organisational_departments")
    .select("id, name")
    .eq("entity_id", entityId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

function KpiBoardPage() {
  const { roles } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();

  const allowed = roles.some((r) => r === "ceo" || r === "manager");

  // Library
  const [library, setLibrary] = useState<KpiCardData[]>([]);
  const [libLoading, setLibLoading] = useState(true);

  // Corporate
  const [corpKpis, setCorpKpis] = useState<KpiCardData[]>([]);
  const [corpLoading, setCorpLoading] = useState(true);

  // Departments
  const [orgDepts, setOrgDepts] = useState<OrgDept[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [deptKpis, setDeptKpis] = useState<KpiCardData[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLevel, setModalLevel] = useState<KpiLevel>("corporate");

  /* ---- loaders ---- */

  const loadLibrary = useCallback(async () => {
    if (!entity_id) return;
    setLibLoading(true);
    try {
      setLibrary(await fetchLibrary(entity_id, selected_year));
    } catch (e) {
      console.error("[KpiBoard] library", e);
    } finally {
      setLibLoading(false);
    }
  }, [entity_id, selected_year]);

  const loadCorporate = useCallback(async () => {
    if (!entity_id) return;
    setCorpLoading(true);
    try {
      setCorpKpis(await fetchCorporateKpis(entity_id, selected_year));
    } catch (e) {
      console.error("[KpiBoard] corporate", e);
    } finally {
      setCorpLoading(false);
    }
  }, [entity_id, selected_year]);

  const loadDeptKpis = useCallback(async () => {
    if (!entity_id || !selectedDept) {
      setDeptKpis([]);
      return;
    }
    setDeptLoading(true);
    try {
      setDeptKpis(await fetchDepartmentKpis(entity_id, selected_year, selectedDept));
    } catch (e) {
      console.error("[KpiBoard] dept", e);
    } finally {
      setDeptLoading(false);
    }
  }, [entity_id, selected_year, selectedDept]);

  useEffect(() => {
    if (!allowed) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    if (!entity_id) return;
    void loadLibrary();
    void loadCorporate();
    fetchOrgDepts(entity_id).then((d) => {
      setOrgDepts(d);
      if (d.length > 0 && !selectedDept) setSelectedDept(d[0].id);
    });
  }, [entity_id, selected_year, allowed]);

  useEffect(() => {
    void loadDeptKpis();
  }, [loadDeptKpis]);

  const handleAddSuccess = () => {
    void loadLibrary();
    void loadCorporate();
    void loadDeptKpis();
  };

  const openModal = (level: KpiLevel) => {
    setModalLevel(level);
    setModalOpen(true);
  };

  if (!allowed) return null;

  /* ---- render ---- */

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">KPI Board</h1>
        <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">{selected_year}</span>
      </div>

      {/* Three-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- 1. KPI Library ---- */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Library className="h-4 w-4 text-muted-foreground" />
              KPI Library ({library.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[calc(100vh-260px)] px-4 pb-4">
              {libLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : library.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No KPIs defined yet.</p>
              ) : (
                <div className="space-y-2">
                  {library.map((k) => (
                    <KpiCard key={k.id} kpi={k} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ---- 2. Corporate KPIs ---- */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Corporate KPIs ({corpKpis.length}/10)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openModal("corporate")}>
                <Plus className="h-4 w-4" />
                Add KPI
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[calc(100vh-260px)] px-4 pb-4">
              {corpLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : corpKpis.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No corporate KPIs yet.</p>
              ) : (
                <div className="space-y-2">
                  {corpKpis.map((k) => (
                    <KpiCard key={k.id} kpi={k} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ---- 3. Department KPIs ---- */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Department KPIs ({deptKpis.length}/10)
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedDept}
                onClick={() => openModal("department")}
              >
                <Plus className="h-4 w-4" />
                Add KPI
              </Button>
            </div>
            {orgDepts.length > 0 && (
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {orgDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[calc(100vh-320px)] px-4 pb-4">
              {deptLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : deptKpis.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {selectedDept ? "No KPIs for this department yet." : "Select a department."}
                </p>
              ) : (
                <div className="space-y-2">
                  {deptKpis.map((k) => (
                    <KpiCard key={k.id} kpi={k} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Add KPI Modal */}
      <AddKpiModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        level={modalLevel}
        onSuccess={handleAddSuccess}
        org_department_id={modalLevel === "department" ? selectedDept : null}
      />
    </div>
  );
}
