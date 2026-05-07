import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  TrendingUp, Zap, Heart, Loader2, ArrowRight,
  Plus, Library, Building2, Briefcase, AlertCircle, Pencil, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
import type { KpiCardData } from "@/components/kpi/KpiCard";
import { KpiTable } from "@/components/kpi/KpiTable";
import { AddKpiModal, type KpiLevel } from "@/components/kpi/AddKpiModal";

export const Route = createFileRoute("/_authenticated/_setupLayout/kpi-setup")({
  component: KpiSetupPage,
});

/* ── Driver types ─────────────────────────────────────────────────────────── */

type DriverKey = "growth" | "efficiency" | "culture";

const DRIVERS: { key: DriverKey; label: string; icon: typeof TrendingUp; color: string; bar: string }[] = [
  { key: "growth",     label: "Growth",     icon: TrendingUp, color: "text-green-600", bar: "bg-green-500" },
  { key: "efficiency", label: "Efficiency", icon: Zap,        color: "text-blue-600",  bar: "bg-blue-500"  },
  { key: "culture",    label: "Culture",    icon: Heart,      color: "text-amber-600", bar: "bg-amber-500" },
];

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ── Allocation bar ───────────────────────────────────────────────────────── */

type BarSegment = { key: DriverKey; pct: number; bar: string; label: string };

function AllocationBar({ segments, empty }: { segments: BarSegment[]; empty?: boolean }) {
  if (empty || segments.every((s) => s.pct === 0)) {
    return <div className="h-6 w-full rounded-full bg-muted" />;
  }
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-full">
      {segments.map((s) =>
        s.pct === 0 ? null : (
          <div
            key={s.key}
            className={cn("flex items-center justify-center text-[10px] font-semibold text-white", s.bar)}
            style={{ width: `${s.pct}%` }}
          >
            {s.pct >= 12 ? `${s.pct}%` : ""}
          </div>
        ),
      )}
    </div>
  );
}

/* ── Data fetchers ────────────────────────────────────────────────────────── */

type OrgDept = { id: string; name: string };
const MAX_KPIS = 10;

type PanelState = {
  isEditMode: boolean;
  editingRows: Record<string, KpiCardData>;
  isDeleteMode: boolean;
  selectedForDelete: Set<string>;
};

const EMPTY_PANEL: PanelState = {
  isEditMode: false,
  editingRows: {},
  isDeleteMode: false,
  selectedForDelete: new Set(),
};

async function fetchLibrary(entityId: string, year: number): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("kpi_definitions")
    .select("id, title, description, driver, kpi_type, unit")
    .eq("entity_id", entityId)
    .eq("year", year)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id, title: d.title, description: d.description ?? null,
    driver: d.driver as KpiCardData["driver"],
    kpi_type: d.kpi_type as KpiCardData["kpi_type"],
    unit: d.unit,
    yearend_target_value: null, yearend_target_binary: null,
  }));
}

async function fetchCorporateKpis(entityId: string, year: number): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("corporate_kpis")
    .select("id, display_order, kpi_definition_id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
    .eq("entity_id", entityId).eq("year", year).order("display_order");
  if (error) throw error;
  if (!data?.length) return [];

  const ids = data.map((r) => r.id);
  const { data: tgts } = await supabase
    .from("corporate_kpi_targets")
    .select("corporate_kpi_id, period, target_value, target_binary")
    .in("corporate_kpi_id", ids);

  const tgtMap = new Map<string, Record<string, { target_value: number | null; target_binary: boolean | null }>>();
  for (const t of tgts ?? []) {
    if (!tgtMap.has(t.corporate_kpi_id)) tgtMap.set(t.corporate_kpi_id, {});
    tgtMap.get(t.corporate_kpi_id)![t.period] = { target_value: t.target_value ?? null, target_binary: t.target_binary ?? null };
  }

  const { data: deptLinks } = await supabase
    .from("department_kpis")
    .select("corporate_kpi_id, kpi_definitions(title)")
    .in("corporate_kpi_id", ids);

  const deptLinksMap = new Map<string, string[]>();
  for (const dl of deptLinks ?? []) {
    const cid = (dl as unknown as { corporate_kpi_id: string | null }).corporate_kpi_id;
    const title = (dl.kpi_definitions as unknown as { title: string } | null)?.title;
    if (cid && title) {
      if (!deptLinksMap.has(cid)) deptLinksMap.set(cid, []);
      deptLinksMap.get(cid)!.push(title);
    }
  }

  return data.flatMap((row) => {
    const def = row.kpi_definitions as unknown as { id: string; title: string; description: string | null; driver: string; kpi_type: string; unit: string | null } | null;
    if (!def) return [];
    const pt = tgtMap.get(row.id) ?? {};
    return [{
      id: def.id, board_kpi_id: row.id, title: def.title, description: def.description ?? null,
      driver: def.driver as KpiCardData["driver"], kpi_type: def.kpi_type as KpiCardData["kpi_type"], unit: def.unit,
      period_targets: pt,
      yearend_target_value: pt["fullyear"]?.target_value ?? null,
      yearend_target_binary: pt["fullyear"]?.target_binary ?? null,
      linked_dept_kpi_titles: deptLinksMap.get(row.id) ?? null,
    }];
  });
}

async function fetchDepartmentKpis(entityId: string, year: number, orgDeptId: string): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("department_kpis")
    .select("id, display_order, kpi_definition_id, corporate_kpi_id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
    .eq("entity_id", entityId).eq("year", year).eq("org_department_id", orgDeptId).order("display_order");
  if (error) throw error;
  if (!data?.length) return [];

  const ids = data.map((r) => r.id);
  const corpKpiIds = [...new Set(data.map((r) => (r as unknown as { corporate_kpi_id?: string | null }).corporate_kpi_id).filter(Boolean))] as string[];

  const [tgtsRes, corpKpiRes] = await Promise.all([
    supabase.from("department_kpi_targets").select("department_kpi_id, period, target_value, target_binary").in("department_kpi_id", ids),
    corpKpiIds.length > 0
      ? supabase.from("corporate_kpis").select("id, kpi_definitions(title)").in("id", corpKpiIds)
      : Promise.resolve({ data: [] as { id: string; kpi_definitions: unknown }[] }),
  ]);

  const tgtMap = new Map<string, Record<string, { target_value: number | null; target_binary: boolean | null }>>();
  for (const t of tgtsRes.data ?? []) {
    if (!tgtMap.has(t.department_kpi_id)) tgtMap.set(t.department_kpi_id, {});
    tgtMap.get(t.department_kpi_id)![t.period] = { target_value: t.target_value ?? null, target_binary: t.target_binary ?? null };
  }

  const corpTitleMap = new Map<string, string>();
  for (const ck of corpKpiRes.data ?? []) {
    const title = (ck.kpi_definitions as unknown as { title: string } | null)?.title ?? null;
    if (title) corpTitleMap.set(ck.id, title);
  }

  return data.flatMap((row) => {
    const def = row.kpi_definitions as unknown as { id: string; title: string; description: string | null; driver: string; kpi_type: string; unit: string | null } | null;
    if (!def) return [];
    const pt = tgtMap.get(row.id) ?? {};
    const corpKpiId = (row as unknown as { corporate_kpi_id?: string | null }).corporate_kpi_id;
    return [{
      id: def.id, board_kpi_id: row.id, title: def.title, description: def.description ?? null,
      driver: def.driver as KpiCardData["driver"], kpi_type: def.kpi_type as KpiCardData["kpi_type"], unit: def.unit,
      period_targets: pt,
      yearend_target_value: pt["fullyear"]?.target_value ?? null,
      yearend_target_binary: pt["fullyear"]?.target_binary ?? null,
      corp_kpi_id:    corpKpiId ?? null,
      corp_kpi_title: corpKpiId ? (corpTitleMap.get(corpKpiId) ?? null) : null,
    }];
  });
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

function KpiSetupPage() {
  const { roles } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();

  const allowed = roles.includes("ceo");

  /* ── Driver weightings ── */
  const [driverValues, setDriverValues] = useState<Record<DriverKey, number>>({ growth: 33, efficiency: 33, culture: 34 });
  const [savedDriverValues, setSavedDriverValues] = useState<Record<DriverKey, number> | null>(null);
  const [driverLoading, setDriverLoading] = useState(true);
  const [driverSaving, setDriverSaving] = useState(false);
  const [existingDriverId, setExistingDriverId] = useState<string | null>(null);

  const driverTotal = driverValues.growth + driverValues.efficiency + driverValues.culture;
  const driverValid = driverTotal === 100;
  const driverDirty = savedDriverValues !== null && (
    driverValues.growth     !== savedDriverValues.growth ||
    driverValues.efficiency !== savedDriverValues.efficiency ||
    driverValues.culture    !== savedDriverValues.culture
  );

  /* ── KPI board ── */
  const [library,      setLibrary]      = useState<KpiCardData[]>([]);
  const [corpKpis,     setCorpKpis]     = useState<KpiCardData[]>([]);
  const [orgDepts,     setOrgDepts]     = useState<OrgDept[]>([]);
  const [deptKpisMap,  setDeptKpisMap]  = useState<Record<string, KpiCardData[]>>({});
  const [libLoading,   setLibLoading]   = useState(true);
  const [corpLoading,  setCorpLoading]  = useState(true);
  const [deptLoading,  setDeptLoading]  = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalLevel,   setModalLevel]   = useState<KpiLevel>("corporate");
  const [modalDeptId,  setModalDeptId]  = useState<string | null>(null);
  const [proceeding,   setProceeding]   = useState(false);

  /* ── Panel edit/delete state ── */
  const [panelStates,   setPanelStates]   = useState<Record<string, PanelState>>({});
  const [deleteDialog,  setDeleteDialog]  = useState<{ panelKey: string; step: 1 | 2 } | null>(null);
  const [panelSaving,   setPanelSaving]   = useState<Record<string, boolean>>({});
  const [multiDeleting, setMultiDeleting] = useState(false);

  /* ── Panel state helpers ── */
  function ps(key: string): PanelState { return panelStates[key] ?? EMPTY_PANEL; }
  function updPanel(key: string, fn: (prev: PanelState) => PanelState) {
    setPanelStates((prev) => ({ ...prev, [key]: fn(prev[key] ?? EMPTY_PANEL) }));
  }
  function enterEdit(key: string, kpis: KpiCardData[]) {
    updPanel(key, () => ({
      isEditMode: true,
      editingRows: Object.fromEntries(kpis.map((k) => [k.id, { ...k }])),
      isDeleteMode: false,
      selectedForDelete: new Set(),
    }));
  }
  function cancelEdit(key: string) {
    updPanel(key, (p) => ({ ...p, isEditMode: false, editingRows: {} }));
  }
  function enterDelete(key: string) {
    updPanel(key, () => ({ isEditMode: false, editingRows: {}, isDeleteMode: true, selectedForDelete: new Set() }));
  }
  function cancelDelete(key: string) {
    updPanel(key, (p) => ({ ...p, isDeleteMode: false, selectedForDelete: new Set() }));
  }
  function toggleSelect(key: string, kpiId: string) {
    updPanel(key, (p) => {
      const next = new Set(p.selectedForDelete);
      if (next.has(kpiId)) next.delete(kpiId); else next.add(kpiId);
      return { ...p, selectedForDelete: next };
    });
  }
  function updateRow(key: string, kpiId: string, updated: KpiCardData) {
    updPanel(key, (p) => ({ ...p, editingRows: { ...p.editingRows, [kpiId]: updated } }));
  }

  /* ── Load drivers ── */
  useEffect(() => {
    if (!allowed || !entity_id) { setDriverLoading(false); return; }
    let cancelled = false;
    void (async () => {
      setDriverLoading(true);
      const { data, error } = await supabase.from("drivers").select("id, growth_pct, efficiency_pct, culture_pct").eq("entity_id", entity_id).eq("year", selected_year).maybeSingle();
      if (cancelled) return;
      if (error) toast.error("Failed to load driver weightings.");
      if (data) {
        setExistingDriverId(data.id);
        const vals = { growth: Number(data.growth_pct) || 0, efficiency: Number(data.efficiency_pct) || 0, culture: Number(data.culture_pct) || 0 };
        setDriverValues(vals);
        setSavedDriverValues(vals);
      } else {
        setExistingDriverId(null);
        setDriverValues({ growth: 33, efficiency: 33, culture: 34 });
        setSavedDriverValues(null);
      }
      setDriverLoading(false);
    })();
    return () => { cancelled = true; };
  }, [allowed, entity_id, selected_year]);

  /* ── KPI loaders ── */
  const loadLibrary = useCallback(async () => {
    if (!entity_id) return;
    setLibLoading(true);
    try { setLibrary(await fetchLibrary(entity_id, selected_year)); }
    catch (e) { console.error("[KpiSetup] library", e); }
    finally { setLibLoading(false); }
  }, [entity_id, selected_year]);

  const loadCorporate = useCallback(async () => {
    if (!entity_id) return;
    setCorpLoading(true);
    try { setCorpKpis(await fetchCorporateKpis(entity_id, selected_year)); }
    catch (e) { console.error("[KpiSetup] corporate", e); }
    finally { setCorpLoading(false); }
  }, [entity_id, selected_year]);

  const loadAllDeptKpis = useCallback(async () => {
    if (!entity_id || orgDepts.length === 0) return;
    setDeptLoading(true);
    try {
      const entries = await Promise.all(
        orgDepts.map(async (dept) => [dept.id, await fetchDepartmentKpis(entity_id, selected_year, dept.id)] as [string, KpiCardData[]]),
      );
      setDeptKpisMap(Object.fromEntries(entries));
    } catch (e) { console.error("[KpiSetup] depts", e); }
    finally { setDeptLoading(false); }
  }, [entity_id, selected_year, orgDepts]);

  useEffect(() => {
    if (!allowed || !entity_id) return;
    void loadLibrary();
    void loadCorporate();
    supabase.from("organisational_departments").select("id, name").eq("entity_id", entity_id).order("name")
      .then(({ data }) => setOrgDepts(data ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity_id, selected_year, allowed]);

  useEffect(() => { if (orgDepts.length > 0) void loadAllDeptKpis(); }, [loadAllDeptKpis]);

  /* ── Driver counts ── */
  const driverCounts = useMemo(() => ({
    growth:     library.filter((k) => k.driver === "growth").length,
    efficiency: library.filter((k) => k.driver === "efficiency").length,
    culture:    library.filter((k) => k.driver === "culture").length,
  }), [library]);

  const totalLibKpis = driverCounts.growth + driverCounts.efficiency + driverCounts.culture;

  const targetBarSegments: BarSegment[] = DRIVERS.map((d) => ({ key: d.key, pct: driverValid ? driverValues[d.key] : 0, bar: d.bar, label: d.label }));
  const kpiBarSegments: BarSegment[]    = DRIVERS.map((d) => ({ key: d.key, pct: totalLibKpis > 0 ? Math.round((driverCounts[d.key] / totalLibKpis) * 100) : 0, bar: d.bar, label: d.label }));

  /* ── Driver save ── */
  const handleDriverSave = async () => {
    if (!entity_id || !driverValid) return;
    setDriverSaving(true);
    try {
      if (existingDriverId) {
        const { error } = await supabase.from("drivers").update({ growth_pct: driverValues.growth, efficiency_pct: driverValues.efficiency, culture_pct: driverValues.culture }).eq("id", existingDriverId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("drivers").insert({ entity_id, year: selected_year, growth_pct: driverValues.growth, efficiency_pct: driverValues.efficiency, culture_pct: driverValues.culture }).select("id").single();
        if (error) throw error;
        if (data) setExistingDriverId(data.id);
      }
      setSavedDriverValues({ ...driverValues });
      toast.success(`Driver weightings saved for ${selected_year}.`);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDriverSaving(false);
    }
  };

  /* ── Save all edits for a panel ── */
  async function saveAll(panelKey: string, kpis: KpiCardData[]) {
    const state = ps(panelKey);
    const edited = Object.values(state.editingRows);
    if (edited.length === 0) { cancelEdit(panelKey); return; }

    const invalid = edited.filter((k) => !k.title.trim());
    if (invalid.length > 0) { toast.error("All KPIs must have a title."); return; }

    type PeriodEnum = "q1" | "q2" | "q3" | "q4" | "h1" | "h2" | "halfyear" | "fullyear";

    setPanelSaving((p) => ({ ...p, [panelKey]: true }));
    try {
      for (const kpi of edited) {
        const { error: defErr } = await supabase
          .from("kpi_definitions")
          .update({ title: kpi.title.trim(), description: kpi.description ?? null, driver: kpi.driver, kpi_type: kpi.kpi_type, unit: kpi.unit })
          .eq("id", kpi.id);
        if (defErr) throw defErr;

        if (kpi.board_kpi_id) {
          const isCorpPanel = panelKey === "corporate";

          let upsertRows: { period: PeriodEnum; target_value: number | null; target_binary: boolean | null }[];

          if (kpi.kpi_type === "binary") {
            // Binary: only H1 and FY with binary flags
            const pt = kpi.period_targets ?? {};
            upsertRows = [
              { period: "h1",       target_binary: pt["h1"]?.target_binary ?? null,       target_value: null },
              { period: "fullyear", target_binary: pt["fullyear"]?.target_binary ?? null, target_value: null },
            ];
          } else {
            // Progressive / Benchmark: Q1-Q4 editable, H1/H2/FY derived
            const pt = kpi.period_targets ?? {};
            const q1 = pt["q1"]?.target_value ?? null;
            const q2 = pt["q2"]?.target_value ?? null;
            const q3 = pt["q3"]?.target_value ?? null;
            const q4 = pt["q4"]?.target_value ?? null;
            const h1 = q1 !== null && q2 !== null ? q1 + q2 : null;
            const h2 = q3 !== null && q4 !== null ? q3 + q4 : null;
            const fy = h1 !== null && h2 !== null ? h1 + h2 : null;
            const all: [PeriodEnum, number | null][] = [
              ["q1", q1], ["q2", q2], ["h1", h1], ["q3", q3], ["q4", q4], ["h2", h2], ["fullyear", fy],
            ];
            upsertRows = all.map(([period, v]) => ({ period, target_value: v, target_binary: null }));
          }

          if (isCorpPanel) {
            const rows = upsertRows.map((r) => ({ ...r, corporate_kpi_id: kpi.board_kpi_id! }));
            const { error } = await supabase.from("corporate_kpi_targets").upsert(rows, { onConflict: "corporate_kpi_id,period" });
            if (error) throw error;
          } else {
            const rows = upsertRows.map((r) => ({ ...r, department_kpi_id: kpi.board_kpi_id! }));
            const { error } = await supabase.from("department_kpi_targets").upsert(rows, { onConflict: "department_kpi_id,period" });
            if (error) throw error;
            // Update corporate KPI link for dept KPIs
            await supabase
              .from("department_kpis")
              .update({ corporate_kpi_id: kpi.corp_kpi_id ?? null } as never)
              .eq("id", kpi.board_kpi_id!);
          }
        }
      }
      toast.success("Changes saved.");
      cancelEdit(panelKey);
      if (panelKey === "corporate") void loadCorporate();
      else void loadAllDeptKpis();
      void loadLibrary();
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPanelSaving((p) => ({ ...p, [panelKey]: false }));
    }
  }

  /* ── Multi-delete ── */
  async function doMultiDelete() {
    if (!deleteDialog) return;
    const { panelKey } = deleteDialog;
    const state = ps(panelKey);
    const kpis = panelKey === "corporate" ? corpKpis : (deptKpisMap[panelKey] ?? []);
    const selected = kpis.filter((k) => state.selectedForDelete.has(k.id));
    const boardIds = selected.map((k) => k.board_kpi_id).filter(Boolean) as string[];
    if (boardIds.length === 0) { setDeleteDialog(null); cancelDelete(panelKey); return; }

    setMultiDeleting(true);
    try {
      if (panelKey === "corporate") {
        await supabase.from("corporate_kpi_targets").delete().in("corporate_kpi_id", boardIds);
        await supabase.from("corporate_kpis").delete().in("id", boardIds);
        void loadCorporate();
      } else {
        await supabase.from("department_kpi_targets").delete().in("department_kpi_id", boardIds);
        await supabase.from("department_kpis").delete().in("id", boardIds);
        void loadAllDeptKpis();
      }
      void loadLibrary();
      toast.success(`${selected.length} KPI${selected.length !== 1 ? "s" : ""} deleted.`);
      cancelDelete(panelKey);
      setDeleteDialog(null);
    } catch (err) {
      toast.error("Failed to delete KPIs.");
      console.error(err);
    } finally {
      setMultiDeleting(false);
    }
  }

  /* ── Proceed ── */
  const handleProceed = async () => {
    if (!entity_id) return;
    if (!existingDriverId) { toast.error("Save your driver weightings before proceeding."); return; }
    setProceeding(true);
    try {
      const { error } = await supabase.from("setup_progress").upsert(
        [
          { entity_id, step_key: "set_driver_weightings",     status: "complete", updated_at: new Date().toISOString() },
          { entity_id, step_key: "configure_corporate_kpis",  status: "complete", updated_at: new Date().toISOString() },
          { entity_id, step_key: "configure_department_kpis", status: "complete", updated_at: new Date().toISOString() },
        ],
        { onConflict: "entity_id,step_key" },
      );
      if (error) throw error;
      navigate({ to: "/bonus-setup" });
    } catch {
      toast.error("Failed to proceed. Please try again.");
    } finally {
      setProceeding(false);
    }
  };

  const handleAddSuccess = () => { void loadLibrary(); void loadCorporate(); void loadAllDeptKpis(); };

  const openModal = (level: KpiLevel, deptId?: string) => {
    setModalLevel(level);
    setModalDeptId(deptId ?? null);
    setModalOpen(true);
  };

  const corpAtLimit     = corpKpis.length >= MAX_KPIS;
  const entityReady     = !!entity_id && !entityLoading;
  const corpKpisForLink = corpKpis.filter((k) => k.board_kpi_id).map((k) => ({ id: k.board_kpi_id!, title: k.title }));

  if (!allowed) {
    return <div className="p-8"><p className="text-sm text-muted-foreground">Access denied. Only the CEO can access KPI Setup.</p></div>;
  }

  /* ── Panel header actions ── */
  function PanelActions({
    panelKey,
    kpis,
    atLimit,
    onAddKpi,
  }: {
    panelKey: string;
    kpis: KpiCardData[];
    atLimit: boolean;
    onAddKpi: () => void;
  }) {
    const state = ps(panelKey);
    const isSaving = panelSaving[panelKey] ?? false;
    return (
      <div className="flex items-center gap-1.5">
        {state.isEditMode ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => cancelEdit(panelKey)} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void saveAll(panelKey, kpis)} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : "Save All"}
            </Button>
          </>
        ) : state.isDeleteMode ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => cancelDelete(panelKey)} disabled={multiDeleting}>
              Cancel
            </Button>
            <Button
              size="sm" variant="destructive"
              disabled={state.selectedForDelete.size === 0 || multiDeleting}
              onClick={() => setDeleteDialog({ panelKey, step: 1 })}
            >
              Confirm Delete ({state.selectedForDelete.size})
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => enterEdit(panelKey, kpis)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => enterDelete(panelKey)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
            </Button>
          </>
        )}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={atLimit ? 0 : -1}>
                <Button size="sm" variant="outline" disabled={atLimit || !entityReady} onClick={onAddKpi}>
                  <Plus className="h-4 w-4" />Add KPI
                </Button>
              </span>
            </TooltipTrigger>
            {atLimit && <TooltipContent>Maximum 10 KPIs per board.</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">KPI Setup</h1>
          <p className="text-sm text-muted-foreground">Year: <span className="font-medium text-foreground">{selected_year}</span></p>
        </div>
      </div>

      {/* ── Driver Weightings ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Driver Weightings</CardTitle>
            <div className="flex items-center gap-3">
              {driverDirty && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />Unsaved changes
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={driverValid ? -1 : 0}>
                      <Button size="sm" variant={driverDirty ? "default" : "outline"} onClick={handleDriverSave} disabled={!driverValid || driverSaving}>
                        {driverSaving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : "Save Weightings"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!driverValid && <TooltipContent>Weightings must sum to 100%</TooltipContent>}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {driverLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {DRIVERS.map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="space-y-1.5">
                    <label className={cn("flex items-center gap-1.5 text-sm font-medium", color)}>
                      <Icon className="h-3.5 w-3.5" />{label}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} max={100} value={driverValues[key]} onChange={(e) => setDriverValues((p) => ({ ...p, [key]: clamp(Number(e.target.value)) }))} className="w-20 text-center" />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className={cn("text-sm font-medium", driverValid ? "text-muted-foreground" : "text-destructive")}>
                Total: <span className={cn("font-bold", driverValid ? "text-foreground" : "text-destructive")}>{driverTotal}%</span>
                {!driverValid && <span className="ml-2 text-xs">— must equal 100%</span>}
              </p>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Allocation</p>
                <AllocationBar segments={targetBarSegments} empty={!driverValid} />
                <div className="flex gap-4">
                  {DRIVERS.map((d) => (
                    <span key={d.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className={cn("inline-block h-2 w-2 rounded-full", d.bar)} />{d.label}: {driverValues[d.key]}%
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">KPI Distribution (Library)</p>
                  <div className="flex gap-3">
                    {DRIVERS.map((d) => (
                      <span key={d.key} className={cn("text-xs font-medium", d.color)}>{d.label}: {driverCounts[d.key]}</span>
                    ))}
                    <span className="text-xs text-muted-foreground">({totalLibKpis} total)</span>
                  </div>
                </div>
                <AllocationBar segments={kpiBarSegments} empty={totalLibKpis === 0} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Panels — full-width stacked ── */}
      <div className="space-y-3">

        {/* Library */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Library className="h-4 w-4 text-muted-foreground" />
              KPI Library ({library.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <KpiTable kpis={library} variant="library" loading={libLoading} />
          </CardContent>
        </Card>

        {/* Corporate KPIs */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Corporate KPIs ({corpKpis.length}/10)
              </CardTitle>
              <PanelActions
                panelKey="corporate"
                kpis={corpKpis}
                atLimit={corpAtLimit}
                onAddKpi={() => openModal("corporate")}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <KpiTable
              kpis={corpKpis}
              variant="corporate"
              loading={corpLoading}
              isEditMode={ps("corporate").isEditMode}
              editingRows={ps("corporate").editingRows}
              onRowChange={(id, updated) => updateRow("corporate", id, updated)}
              isDeleteMode={ps("corporate").isDeleteMode}
              selectedForDelete={ps("corporate").selectedForDelete}
              onToggleSelect={(id) => toggleSelect("corporate", id)}
            />
          </CardContent>
        </Card>

        {/* Per-department panels */}
        {orgDepts.map((dept) => {
          const kpis    = deptKpisMap[dept.id] ?? [];
          const atLimit = kpis.length >= MAX_KPIS;
          return (
            <Card key={dept.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Department KPIs — {dept.name} ({kpis.length}/10)
                  </CardTitle>
                  <PanelActions
                    panelKey={dept.id}
                    kpis={kpis}
                    atLimit={atLimit}
                    onAddKpi={() => openModal("department", dept.id)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <KpiTable
                  kpis={kpis}
                  variant="department"
                  loading={deptLoading && kpis.length === 0}
                  isEditMode={ps(dept.id).isEditMode}
                  editingRows={ps(dept.id).editingRows}
                  onRowChange={(id, updated) => updateRow(dept.id, id, updated)}
                  isDeleteMode={ps(dept.id).isDeleteMode}
                  selectedForDelete={ps(dept.id).selectedForDelete}
                  onToggleSelect={(id) => toggleSelect(dept.id, id)}
                  corpKpisForLink={corpKpisForLink}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Proceed */}
      <div className="flex justify-end pt-1 pb-3">
        <Button onClick={handleProceed} disabled={proceeding || !entityReady}>
          {proceeding ? "Saving..." : "Proceed to Bonus Setup"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <AddKpiModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        level={modalLevel}
        onSuccess={handleAddSuccess}
        org_department_id={modalLevel === "department" ? modalDeptId : null}
      />

      {/* Multi-delete confirmation (two-step) */}
      <AlertDialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog?.step === 1
                ? `Delete ${ps(deleteDialog.panelKey).selectedForDelete.size} KPI${ps(deleteDialog.panelKey).selectedForDelete.size !== 1 ? "s" : ""}?`
                : "Are you sure?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.step === 1
                ? "This will remove the selected KPIs from the board and delete their targets. KPI definitions remain in the library."
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialog(null)}>Cancel</AlertDialogCancel>
            {deleteDialog?.step === 1 ? (
              <Button
                onClick={() => deleteDialog && setDeleteDialog({ panelKey: deleteDialog.panelKey, step: 2 })}
              >
                Proceed
              </Button>
            ) : (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={multiDeleting}
                onClick={() => void doMultiDelete()}
              >
                {multiDeleting ? "Deleting…" : "Delete KPIs"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
