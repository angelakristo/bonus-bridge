import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KpiCardData } from "@/components/kpi/KpiCard";
import { KpiTable } from "@/components/kpi/KpiTable";
import logoUrl from "@/assets/bonusbridge-full.png";

/* ── Types ────────────────────────────────────────────────────────────────── */

type OrgDept = { id: string; name: string };

export type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string | null;
  entityName: string | null;
  year: number;
};

/* ── Period helpers ───────────────────────────────────────────────────────── */

const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
type Period = (typeof PERIODS)[number];

const BINARY_EDITABLE = new Set<Period>(["h1", "fullyear"]);

function periodCell(kpi: KpiCardData, period: Period): string {
  const t = kpi.period_targets?.[period];
  const isBinary = kpi.scoring_type === "binary" || (kpi.scoring_type == null && kpi.kpi_type === "binary");
  if (isBinary) {
    if (!BINARY_EDITABLE.has(period)) return "—";
    if (!t) return "—";
    return t.target_binary === true ? "Yes" : t.target_binary === false ? "No" : "—";
  }
  if (!t || t.target_value === null) return "—";
  return String(t.target_value);
}

/* ── Data fetchers ────────────────────────────────────────────────────────── */

async function fetchCorporateKpis(entityId: string, year: number): Promise<KpiCardData[]> {
  const { data, error } = await supabase
    .from("corporate_kpis")
    .select("id, display_order, kpi_definition_id, kpi_definitions(id, title, description, driver, kpi_type, unit)")
    .eq("entity_id", entityId).eq("year", year).order("display_order");
  if (error || !data?.length) return [];

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
  if (error || !data?.length) return [];

  const ids = data.map((r) => r.id);
  const corpKpiIds = [...new Set(
    data.map((r) => (r as unknown as { corporate_kpi_id?: string | null }).corporate_kpi_id).filter(Boolean),
  )] as string[];

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

/* ── Logo loader ─────────────────────────────────────────────────────────── */

async function loadLogoForWatermark(src: string, opacity: number): Promise<{ dataUrl: string; aspectRatio: number }> {
  const img = new Image();
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Logo load failed"));
  });
  const canvas = document.createElement("canvas");
  canvas.width  = img.naturalWidth  || 400;
  canvas.height = img.naturalHeight || 400;
  const ctx = canvas.getContext("2d")!;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    aspectRatio: canvas.width / canvas.height,
  };
}

/* ── PDF generator ────────────────────────────────────────────────────────── */

const NAVY: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const WHITE: [number, number, number] = [255, 255, 255];
const ALT_ROW: [number, number, number] = [248, 250, 252];
const BORDER: [number, number, number] = [226, 232, 240];

const DRIVER_LABEL: Record<string, string> = { growth: "Growth", efficiency: "Efficiency", culture: "Culture" };
const TYPE_LABEL:   Record<string, string> = { progressive: "Progressive", binary: "Binary", benchmark: "Benchmark" };

// 13 columns matching KpiTable column order: Title, Description, Type, Driver, [Link], Unit, Q1–FY
// Total width 255 mm — fits within 273 mm usable on A4 landscape (297 mm − 2 × 12 mm margin)
const BOARD_COL_WIDTHS = {
  0:  { cellWidth: 38 },  // Title
  1:  { cellWidth: 46 },  // Description
  2:  { cellWidth: 22 },  // Type
  3:  { cellWidth: 22 },  // Driver
  4:  { cellWidth: 38 },  // Link column (Related KPI / Department KPI / Corporate KPI)
  5:  { cellWidth: 12 },  // Unit
  6:  { cellWidth: 11 },  // Q1
  7:  { cellWidth: 11 },  // Q2
  8:  { cellWidth: 11 },  // H1
  9:  { cellWidth: 11 },  // Q3
  10: { cellWidth: 11 },  // Q4
  11: { cellWidth: 11 },  // H2
  12: { cellWidth: 11 },  // FY
};

async function generatePdf(
  entityName: string | null,
  year: number,
  generatedDate: string,
  library: KpiCardData[],
  corpKpis: KpiCardData[],
  orgDepts: OrgDept[],
  deptMap: Record<string, KpiCardData[]>,
): Promise<void> {
  const { dataUrl: wmDataUrl, aspectRatio: wmAR } = await loadLogoForWatermark(logoUrl, 0.07);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();   // 297 mm
  const PH = doc.internal.pageSize.getHeight();  // 210 mm
  const M  = 12;

  const wmW = PW * 0.55;
  const wmH = wmW / wmAR;
  const wmX = (PW - wmW) / 2;
  const wmY = (PH - wmH) / 2;

  const watermarkedPages = new Set<number>();

  function stampWatermark() {
    const n = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
      .getCurrentPageInfo().pageNumber;
    if (watermarkedPages.has(n)) return;
    watermarkedPages.add(n);
    doc.addImage(wmDataUrl, "PNG", wmX, wmY, wmW, wmH);
  }

  function drawRunningHeader(section: string) {
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${entityName ?? "BonusBridge"}  ·  KPI Board Report  ·  ${year}  |  ${section}`, M, 7);
    const pg = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
      .getCurrentPageInfo().pageNumber;
    doc.text(`Page ${pg}  ·  Confidential`, PW - M, 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  function sectionTitle(text: string, y: number) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(text, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
  }

  function emptyNote(y: number) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("No KPIs added yet.", M, y);
    doc.setTextColor(0, 0, 0);
  }

  const baseTable = {
    margin: { left: M, right: M, top: 10, bottom: 8 },
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      overflow: "linebreak" as const,
      lineColor: BORDER,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold" as const,
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    tableLineColor: BORDER,
    tableLineWidth: 0.1,
  };

  // ── PAGE 1: Cover + KPI Library ───────────────────────────────────────────

  stampWatermark();

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(entityName ?? "Company", M, 17);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`KPI Board Report — ${year}`, M, 24);

  doc.setFontSize(7.5);
  doc.text(`Generated ${generatedDate}  ·  Confidential`, M, 29);
  doc.setTextColor(0, 0, 0);

  sectionTitle("KPI Library", 36);

  if (library.length === 0) {
    emptyNote(43);
    drawRunningHeader("KPI Library");
  } else {
    autoTable(doc, {
      ...baseTable,
      head: [["Title", "Description", "Type", "Driver", "Related KPI", "Unit", "Q1", "Q2", "H1", "Q3", "Q4", "H2", "FY"]],
      body: library.map((kpi) => [
        kpi.title,
        kpi.description ?? "—",
        TYPE_LABEL[kpi.kpi_type] ?? kpi.kpi_type,
        DRIVER_LABEL[kpi.driver] ?? kpi.driver,
        kpi.linked_dept_kpi_titles?.length
          ? kpi.linked_dept_kpi_titles.join(", ")
          : kpi.corp_kpi_title ?? "—",
        kpi.unit ?? "—",
        ...PERIODS.map((p) => periodCell(kpi, p)),
      ]),
      startY: 40,
      columnStyles: BOARD_COL_WIDTHS,
      willDrawPage: (data) => { if (data.pageNumber > 1) stampWatermark(); },
      didDrawPage: () => drawRunningHeader("KPI Library"),
    });
  }

  // ── PAGE: Corporate KPIs ──────────────────────────────────────────────────

  doc.addPage();
  stampWatermark();
  sectionTitle("Corporate KPIs", 16);

  if (corpKpis.length === 0) {
    emptyNote(23);
    drawRunningHeader("Corporate KPIs");
  } else {
    autoTable(doc, {
      ...baseTable,
      head: [["Title", "Description", "Type", "Driver", "Department KPI", "Unit", "Q1", "Q2", "H1", "Q3", "Q4", "H2", "FY"]],
      body: corpKpis.map((kpi) => [
        kpi.title,
        kpi.description ?? "—",
        TYPE_LABEL[kpi.kpi_type] ?? kpi.kpi_type,
        DRIVER_LABEL[kpi.driver] ?? kpi.driver,
        kpi.linked_dept_kpi_titles?.length ? kpi.linked_dept_kpi_titles.join(", ") : "—",
        kpi.unit ?? "—",
        ...PERIODS.map((p) => periodCell(kpi, p)),
      ]),
      startY: 20,
      columnStyles: BOARD_COL_WIDTHS,
      willDrawPage: (data) => { if (data.pageNumber > 1) stampWatermark(); },
      didDrawPage: () => drawRunningHeader("Corporate KPIs"),
    });
  }

  // ── PAGES: One per department ─────────────────────────────────────────────

  for (const dept of orgDepts) {
    const kpis = deptMap[dept.id] ?? [];

    doc.addPage();
    stampWatermark();
    sectionTitle(`${dept.name} — Department KPIs`, 16);

    if (kpis.length === 0) {
      emptyNote(23);
      drawRunningHeader(dept.name);
    } else {
      autoTable(doc, {
        ...baseTable,
        head: [["Title", "Description", "Type", "Driver", "Corporate KPI", "Unit", "Q1", "Q2", "H1", "Q3", "Q4", "H2", "FY"]],
        body: kpis.map((kpi) => [
          kpi.title,
          kpi.description ?? "—",
          TYPE_LABEL[kpi.kpi_type] ?? kpi.kpi_type,
          DRIVER_LABEL[kpi.driver] ?? kpi.driver,
          kpi.corp_kpi_title ?? "—",
          kpi.unit ?? "—",
          ...PERIODS.map((p) => periodCell(kpi, p)),
        ]),
        startY: 20,
        columnStyles: BOARD_COL_WIDTHS,
        willDrawPage: (data) => { if (data.pageNumber > 1) stampWatermark(); },
        didDrawPage: () => drawRunningHeader(dept.name),
      });
    }
  }

  const filename = `${(entityName ?? "BonusBridge").replace(/\s+/g, "-")}-KPI-Board-${year}.pdf`;
  doc.save(filename);
}

/* ── Preview section wrapper ──────────────────────────────────────────────── */

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/* ── Main modal ───────────────────────────────────────────────────────────── */

export function CeoReportModal({ open, onOpenChange, entityId, entityName, year }: Props) {
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [library,    setLibrary]    = useState<KpiCardData[]>([]);
  const [corpKpis,   setCorpKpis]   = useState<KpiCardData[]>([]);
  const [orgDepts,   setOrgDepts]   = useState<OrgDept[]>([]);
  const [deptMap,    setDeptMap]    = useState<Record<string, KpiCardData[]>>({});

  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  useEffect(() => {
    if (!open || !entityId) return;
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId, year]);

  async function load() {
    setLoading(true);
    try {
      const { data: deptsData } = await supabase
        .from("organisational_departments")
        .select("id, name")
        .eq("entity_id", entityId!)
        .order("name");
      const deptList = (deptsData ?? []) as OrgDept[];
      setOrgDepts(deptList);

      const [corp, ...deptResults] = await Promise.all([
        fetchCorporateKpis(entityId!, year),
        ...deptList.map((d) => fetchDepartmentKpis(entityId!, year, d.id)),
      ]);
      setCorpKpis(corp);
      const dm: Record<string, KpiCardData[]> = {};
      deptList.forEach((d, i) => { dm[d.id] = deptResults[i]; });
      setDeptMap(dm);
      setLibrary([...corp, ...deptResults.flat()]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setGenerating(true);
    try {
      await generatePdf(entityName, year, generatedDate, library, corpKpis, orgDepts, deptMap);
    } finally {
      setGenerating(false);
    }
  }

  const totalDeptKpis = Object.values(deptMap).reduce((s, k) => s + k.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <p className="text-base font-semibold leading-none">KPI Board Report</p>
            <p className="text-xs text-muted-foreground mt-1">
              {entityName ?? "Company"} · {year} · Preview below — download for the full landscape PDF
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 text-xs h-8"
              disabled={loading || generating}
              onClick={() => void handleDownload()}
            >
              {generating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                : <><Download className="h-3.5 w-3.5" />Download PDF</>}
            </Button>
            <DialogClose asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-7">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Letterhead */}
              <div className="flex items-start justify-between pb-5 border-b">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{entityName ?? "Company"}</h2>
                  <p className="text-sm text-muted-foreground mt-1">KPI Board Report — {year}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Generated {generatedDate}</p>
                  <p className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider">Confidential</p>
                </div>
              </div>

              {/* Summary tiles */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Library KPIs",    value: library.length },
                  { label: "Corporate KPIs",  value: corpKpis.length },
                  { label: "Department KPIs", value: totalDeptKpis },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold leading-none mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* KPI Library — rendered with the same KpiTable used on /kpi-board */}
              <PreviewSection title={`KPI Library (${library.length})`}>
                <KpiTable kpis={library} variant="library" />
              </PreviewSection>

              {/* Corporate KPIs */}
              <PreviewSection title={`Corporate KPIs (${corpKpis.length})`}>
                <KpiTable kpis={corpKpis} variant="corporate" />
              </PreviewSection>

              {/* One section per department — all departments shown, empty state handled by KpiTable */}
              {orgDepts.map((dept) => (
                <PreviewSection key={dept.id} title={`${dept.name} — Department KPIs (${(deptMap[dept.id] ?? []).length})`}>
                  <KpiTable kpis={deptMap[dept.id] ?? []} variant="department" />
                </PreviewSection>
              ))}

              {/* Footer */}
              <div className="pt-2 pb-1 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  Generated by BonusBridge on {generatedDate} · For internal use only
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
