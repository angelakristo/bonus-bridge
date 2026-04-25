import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Plus, Library, Building2, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DraggableKpiCard,
  KpiCardOverlay,
  type KpiCardData,
  type KpiCardSource,
} from "@/components/kpi/KpiCard";
import { AddKpiModal, type KpiLevel } from "@/components/kpi/AddKpiModal";

export const Route = createFileRoute("/_authenticated/kpi-board")({
  component: KpiBoardPage,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OrgDept = { id: string; name: string };

/* prefix helpers — each card needs a globally unique sortable id */
const LIB_PREFIX = "lib_";
const CORP_PREFIX = "corp_";
const DEPT_PREFIX = "dept_";

/* ------------------------------------------------------------------ */
/*  Droppable wrapper                                                  */
/* ------------------------------------------------------------------ */

function DroppableColumn({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "ring-2 ring-primary/40 rounded-lg transition-shadow h-full" : "transition-shadow h-full"}
    >
      {children}
    </div>
  );
}

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
/*  DB mutation helpers                                                */
/* ------------------------------------------------------------------ */

const MAX_KPIS_PER_BOARD = 10;

async function insertCorporateKpi(
  entityId: string,
  kpiDefId: string,
  year: number,
  displayOrder: number,
) {
  // Check board limit
  const { count: totalCount } = await supabase
    .from("corporate_kpis")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .eq("year", year);
  if ((totalCount ?? 0) >= MAX_KPIS_PER_BOARD) throw new Error("LIMIT");

  // Check duplicate
  const { count } = await supabase
    .from("corporate_kpis")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .eq("kpi_definition_id", kpiDefId)
    .eq("year", year);
  if ((count ?? 0) > 0) throw new Error("DUPLICATE");

  const { data, error } = await supabase
    .from("corporate_kpis")
    .insert({ entity_id: entityId, kpi_definition_id: kpiDefId, year, display_order: displayOrder })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertDepartmentKpi(
  entityId: string,
  kpiDefId: string,
  year: number,
  orgDeptId: string,
  displayOrder: number,
) {
  const { count: totalCount } = await supabase
    .from("department_kpis")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .eq("year", year)
    .eq("org_department_id", orgDeptId);
  if ((totalCount ?? 0) >= MAX_KPIS_PER_BOARD) throw new Error("LIMIT");

  const { count } = await supabase
    .from("department_kpis")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .eq("kpi_definition_id", kpiDefId)
    .eq("year", year)
    .eq("org_department_id", orgDeptId);
  if ((count ?? 0) > 0) throw new Error("DUPLICATE");

  const { data, error } = await supabase
    .from("department_kpis")
    .insert({
      entity_id: entityId,
      kpi_definition_id: kpiDefId,
      year,
      display_order: displayOrder,
      org_department_id: orgDeptId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function persistCorpOrder(entityId: string, year: number, orderedDefIds: string[]) {
  // Fetch all corporate_kpi rows for this entity/year to map def id → row id
  const { data } = await supabase
    .from("corporate_kpis")
    .select("id, kpi_definition_id")
    .eq("entity_id", entityId)
    .eq("year", year);
  if (!data) return;
  const byDef = new Map(data.map((r) => [r.kpi_definition_id, r.id]));
  for (let i = 0; i < orderedDefIds.length; i++) {
    const rowId = byDef.get(orderedDefIds[i]);
    if (rowId) {
      await supabase.from("corporate_kpis").update({ display_order: i + 1 }).eq("id", rowId);
    }
  }
}

async function persistDeptOrder(
  entityId: string,
  year: number,
  orgDeptId: string,
  orderedDefIds: string[],
) {
  const { data } = await supabase
    .from("department_kpis")
    .select("id, kpi_definition_id")
    .eq("entity_id", entityId)
    .eq("year", year)
    .eq("org_department_id", orgDeptId);
  if (!data) return;
  const byDef = new Map(data.map((r) => [r.kpi_definition_id, r.id]));
  for (let i = 0; i < orderedDefIds.length; i++) {
    const rowId = byDef.get(orderedDefIds[i]);
    if (rowId) {
      await supabase.from("department_kpis").update({ display_order: i + 1 }).eq("id", rowId);
    }
  }
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

  // DnD
  const [activeKpi, setActiveKpi] = useState<KpiCardData | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  /* ---- DnD handlers ---- */

  const resolveContainer = (sortableId: string): KpiCardSource | null => {
    if (sortableId.startsWith(LIB_PREFIX)) return "library";
    if (sortableId.startsWith(CORP_PREFIX)) return "corporate";
    if (sortableId.startsWith(DEPT_PREFIX)) return "department";
    return null;
  };

  const stripPrefix = (sortableId: string) =>
    sortableId.replace(LIB_PREFIX, "").replace(CORP_PREFIX, "").replace(DEPT_PREFIX, "");

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { kpi: KpiCardData } | undefined;
    setActiveKpi(data?.kpi ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveKpi(null);
    const { active, over } = event;
    if (!over || !entity_id) return;

    const sourceContainer = resolveContainer(String(active.id));
    const activeData = active.data.current as { kpi: KpiCardData; source: KpiCardSource } | undefined;
    if (!activeData) return;

    // Determine target container: either from the over item's id prefix or the droppable column id
    let targetContainer: KpiCardSource | null = resolveContainer(String(over.id));
    if (!targetContainer) {
      // over.id might be a droppable column id like "corporate-column"
      if (String(over.id) === "corporate-column") targetContainer = "corporate";
      else if (String(over.id) === "department-column") targetContainer = "department";
    }
    if (!targetContainer) return;

    const kpiDefId = activeData.kpi.id;

    // ---- Cross-container drop: Library/other → Board column ----
    if (sourceContainer !== targetContainer && targetContainer !== "library") {
      if (targetContainer === "corporate") {
        handleDropToCorporate(activeData.kpi);
      } else if (targetContainer === "department") {
        handleDropToDepartment(activeData.kpi);
      }
      return;
    }

    // ---- Same-container reorder ----
    if (sourceContainer === targetContainer && sourceContainer !== "library") {
      const overDefId = stripPrefix(String(over.id));
      if (kpiDefId === overDefId) return; // dropped on self

      if (sourceContainer === "corporate") {
        const oldIdx = corpKpis.findIndex((k) => k.id === kpiDefId);
        const newIdx = corpKpis.findIndex((k) => k.id === overDefId);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(corpKpis, oldIdx, newIdx);
        setCorpKpis(reordered);
        void persistCorpOrder(entity_id, selected_year, reordered.map((k) => k.id));
      } else if (sourceContainer === "department") {
        const oldIdx = deptKpis.findIndex((k) => k.id === kpiDefId);
        const newIdx = deptKpis.findIndex((k) => k.id === overDefId);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(deptKpis, oldIdx, newIdx);
        setDeptKpis(reordered);
        void persistDeptOrder(entity_id, selected_year, selectedDept, reordered.map((k) => k.id));
      }
    }
  };

  /* ---- Drop handlers with optimistic UI ---- */

  const handleDropToCorporate = async (kpi: KpiCardData) => {
    if (!entity_id) return;
    const prev = [...corpKpis];
    if (prev.some((k) => k.id === kpi.id)) {
      toast.error("This KPI is already on the Corporate Board.");
      return;
    }
    if (prev.length >= MAX_KPIS_PER_BOARD) {
      toast.error("Corporate KPI limit reached. Maximum 10 KPIs per board.");
      return;
    }
    setCorpKpis([...prev, kpi]);
    try {
      await insertCorporateKpi(entity_id, kpi.id, selected_year, prev.length + 1);
      toast.success("KPI added to Corporate Board.");
      void loadCorporate();
    } catch (err) {
      setCorpKpis(prev);
      if (err instanceof Error && err.message === "LIMIT") {
        toast.error("Corporate KPI limit reached. Maximum 10 KPIs per board.");
      } else if (err instanceof Error && err.message === "DUPLICATE") {
        toast.error("This KPI is already on the Corporate Board.");
      } else {
        toast.error("Failed to add KPI to Corporate Board.");
        console.error(err);
      }
    }
  };

  const handleDropToDepartment = async (kpi: KpiCardData) => {
    if (!entity_id || !selectedDept) return;
    const prev = [...deptKpis];
    if (prev.some((k) => k.id === kpi.id)) {
      toast.error("This KPI is already on the Department Board.");
      return;
    }
    if (prev.length >= MAX_KPIS_PER_BOARD) {
      toast.error("Department KPI limit reached. Maximum 10 KPIs per board.");
      return;
    }
    setDeptKpis([...prev, kpi]);
    try {
      await insertDepartmentKpi(entity_id, kpi.id, selected_year, selectedDept, prev.length + 1);
      toast.success("KPI added to Department Board.");
      void loadDeptKpis();
    } catch (err) {
      setDeptKpis(prev);
      if (err instanceof Error && err.message === "LIMIT") {
        toast.error("Department KPI limit reached. Maximum 10 KPIs per board.");
      } else if (err instanceof Error && err.message === "DUPLICATE") {
        toast.error("This KPI is already on the Department Board.");
      } else {
        toast.error("Failed to add KPI to Department Board.");
        console.error(err);
      }
    }
  };

  if (!allowed) return null;

  const corpAtLimit = corpKpis.length >= MAX_KPIS_PER_BOARD;
  const deptAtLimit = deptKpis.length >= MAX_KPIS_PER_BOARD;

  /* ---- sortable id lists ---- */
  const libIds = library.map((k) => `${LIB_PREFIX}${k.id}`);
  const corpIds = corpKpis.map((k) => `${CORP_PREFIX}${k.id}`);
  const deptIds = deptKpis.map((k) => `${DEPT_PREFIX}${k.id}`);

  /* ---- render ---- */

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl font-bold tracking-tight">KPI Board</h1>
          <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">{selected_year}</span>
        </div>

        {/* Three-column grid */}
        <div className="flex-1 min-h-0 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* ---- 1. KPI Library ---- */}
          <Card className="flex flex-col min-h-64 lg:min-h-0">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Library className="h-4 w-4 text-muted-foreground" />
                KPI Library ({library.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full px-4 pb-4">
                {libLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : library.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No KPIs defined yet.</p>
                ) : (
                  <SortableContext items={libIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {library.map((k) => (
                        <DraggableKpiCard
                          key={k.id}
                          kpi={k}
                          source="library"
                          sortableId={`${LIB_PREFIX}${k.id}`}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ---- 2. Corporate KPIs ---- */}
          <DroppableColumn id="corporate-column">
            <Card className="flex flex-col min-h-64 lg:min-h-0">
              <CardHeader className="pb-2 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Corporate KPIs ({corpKpis.length}/10)
                  </CardTitle>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={corpAtLimit ? 0 : -1}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={corpAtLimit}
                            onClick={() => openModal("corporate")}
                          >
                            <Plus className="h-4 w-4" />
                            Add KPI
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {corpAtLimit && (
                        <TooltipContent>
                          Corporate KPI limit reached. Maximum 10 KPIs per board.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-full px-4 pb-4">
                  {corpLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : corpKpis.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No corporate KPIs yet. Drag from the Library or click Add KPI.
                    </p>
                  ) : (
                    <SortableContext items={corpIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {corpKpis.map((k) => (
                          <DraggableKpiCard
                            key={k.id}
                            kpi={k}
                            source="corporate"
                            sortableId={`${CORP_PREFIX}${k.id}`}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </DroppableColumn>

          {/* ---- 3. Department KPIs ---- */}
          <DroppableColumn id="department-column">
            <Card className="flex flex-col min-h-64 lg:min-h-0">
              <CardHeader className="pb-2 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Department KPIs ({deptKpis.length}/10)
                  </CardTitle>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={deptAtLimit ? 0 : -1}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!selectedDept || deptAtLimit}
                            onClick={() => openModal("department")}
                          >
                            <Plus className="h-4 w-4" />
                            Add KPI
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {deptAtLimit && (
                        <TooltipContent>
                          Department KPI limit reached. Maximum 10 KPIs per board.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
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
              <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-full px-4 pb-4">
                  {deptLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : deptKpis.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {selectedDept ? "No KPIs for this department yet. Drag from the Library." : "Select a department."}
                    </p>
                  ) : (
                    <SortableContext items={deptIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {deptKpis.map((k) => (
                          <DraggableKpiCard
                            key={k.id}
                            kpi={k}
                            source="department"
                            sortableId={`${DEPT_PREFIX}${k.id}`}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </DroppableColumn>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeKpi ? <KpiCardOverlay kpi={activeKpi} /> : null}
        </DragOverlay>

        {/* Add KPI Modal */}
        <AddKpiModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          level={modalLevel}
          onSuccess={handleAddSuccess}
          org_department_id={modalLevel === "department" ? selectedDept : null}
        />
      </div>
    </DndContext>
  );
}
