import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UploadValidationModal,
  type ValidationError,
} from "@/components/employee-upload/UploadValidationModal";

export const Route = createFileRoute("/_authenticated/actuals-upload")({
  component: ActualsUploadPage,
});

const VALID_PERIODS = ["q1", "q2", "q3", "q4", "h1", "h2", "halfyear", "fullyear"] as const;
type ValidPeriod = (typeof VALID_PERIODS)[number];

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function parseBinaryValue(val: unknown): boolean | null {
  const s = String(val).toLowerCase().trim();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}

function isValidBinary(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return true;
  const s = String(val).toLowerCase().trim();
  return ["true", "false", "1", "0", "yes", "no"].includes(s);
}

function downloadTemplate() {
  const headers = ["email", "period", "kpi_title", "actual_value", "actual_binary"];
  const example = [
    "aisha@northwindtech.demo",
    "q1",
    "Personal Revenue Target",
    "120000",
    "",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 30 }));
  headers.forEach((_, ci) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Actuals");
  XLSX.writeFile(wb, "actuals_template.xlsx");
}

function ActualsUploadPage() {
  const { person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Lookup maps loaded once when entity/year are ready
  const [emailToId, setEmailToId] = useState<Record<string, string>>({});
  const [titleToId, setTitleToId] = useState<Record<string, string>>({});
  const [lookupsReady, setLookupsReady] = useState(false);

  useEffect(() => {
    if (!entity_id) return;
    setLookupsReady(false);
    (async () => {
      const [peopleRes, kpiRes] = await Promise.all([
        supabase
          .from("people")
          .select("id, email")
          .eq("entity_id", entity_id),
        supabase
          .from("kpi_definitions")
          .select("id, title")
          .eq("entity_id", entity_id)
          .eq("year", selected_year),
      ]);

      const em: Record<string, string> = {};
      for (const p of peopleRes.data ?? []) {
        if (p.id && p.email) em[p.email.toLowerCase()] = p.id;
      }
      setEmailToId(em);

      const tm: Record<string, string> = {};
      for (const k of kpiRes.data ?? []) {
        if (k.id && k.title) tm[k.title.toLowerCase()] = k.id;
      }
      setTitleToId(tm);
      setLookupsReady(true);
    })();
  }, [entity_id, selected_year]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!entity_id || !person?.id || !lookupsReady) return;
      setFileName(file.name);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });

      const errors: ValidationError[] = [];
      type ActualInsert = {
        entity_id: string;
        person_id: string;
        kpi_definition_id: string;
        kpi_level: "individual";
        period: string;
        actual_value: number | null;
        actual_binary: boolean | null;
        source: string;
        uploaded_by: string;
      };
      const validRows: ActualInsert[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i];
        const rowNum = i + 2;

        // Normalise: header matching is case-insensitive
        const getField = (name: string) =>
          Object.entries(r).find(([k]) => k.toLowerCase().replace(/\s+/g, "_") === name)?.[1];

        const email = cellStr(getField("email")).toLowerCase();
        const period = cellStr(getField("period")).toLowerCase();
        const kpiTitle = cellStr(getField("kpi_title")).toLowerCase();
        const actualValueRaw = getField("actual_value");
        const actualBinaryRaw = getField("actual_binary");

        const hasValue =
          actualValueRaw !== "" && actualValueRaw !== null && actualValueRaw !== undefined;
        const hasBinary =
          actualBinaryRaw !== "" && actualBinaryRaw !== null && actualBinaryRaw !== undefined;

        let rowOk = true;

        if (!email) {
          errors.push({ row: rowNum, field: "email", error: "Email is required" });
          rowOk = false;
        } else if (!emailToId[email]) {
          errors.push({ row: rowNum, field: "email", error: `No employee found: "${email}"` });
          rowOk = false;
        }

        if (!period) {
          errors.push({ row: rowNum, field: "period", error: "Period is required" });
          rowOk = false;
        } else if (!VALID_PERIODS.includes(period as ValidPeriod)) {
          errors.push({
            row: rowNum,
            field: "period",
            error: `Invalid period "${period}". Must be one of: ${VALID_PERIODS.join(", ")}`,
          });
          rowOk = false;
        }

        if (!kpiTitle) {
          errors.push({ row: rowNum, field: "kpi_title", error: "KPI title is required" });
          rowOk = false;
        } else if (!titleToId[kpiTitle]) {
          errors.push({
            row: rowNum,
            field: "kpi_title",
            error: `No KPI found for "${cellStr(getField("kpi_title"))}" in ${selected_year}`,
          });
          rowOk = false;
        }

        if (!hasValue && !hasBinary) {
          errors.push({
            row: rowNum,
            field: "actual_value",
            error: "Provide actual_value (numeric) or actual_binary (true/false)",
          });
          rowOk = false;
        }

        if (hasValue && isNaN(Number(actualValueRaw))) {
          errors.push({
            row: rowNum,
            field: "actual_value",
            error: `actual_value must be numeric, got "${actualValueRaw}"`,
          });
          rowOk = false;
        }

        if (hasBinary && !isValidBinary(actualBinaryRaw)) {
          errors.push({
            row: rowNum,
            field: "actual_binary",
            error: `actual_binary must be true/false/yes/no/1/0, got "${actualBinaryRaw}"`,
          });
          rowOk = false;
        }

        if (rowOk) {
          validRows.push({
            entity_id,
            person_id: emailToId[email],
            kpi_definition_id: titleToId[kpiTitle],
            kpi_level: "individual",
            period,
            actual_value: hasValue ? Number(actualValueRaw) : null,
            actual_binary: hasBinary ? parseBinaryValue(actualBinaryRaw) : null,
            source: "excel_upload",
            uploaded_by: person.id,
          });
        }
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        setModalOpen(true);
        return;
      }

      setUploading(true);
      try {
        const { error: upsertErr } = await supabase
          .from("actuals")
          .upsert(validRows, {
            onConflict: "entity_id,kpi_definition_id,kpi_level,period,person_id",
          });
        if (upsertErr) throw upsertErr;

        await supabase.from("excel_uploads").insert({
          entity_id,
          uploaded_by: person.id,
          upload_type: "actuals",
          file_name: file.name,
          status: "success",
          row_count: validRows.length,
        });

        toast.success(`${validRows.length} actual${validRows.length !== 1 ? "s" : ""} uploaded.`);
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        console.error(err);
        toast.error("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [entity_id, person, lookupsReady, emailToId, titleToId, selected_year]
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Upload Actuals</h1>
        <p className="text-sm text-muted-foreground">
          {selected_year} · Individual KPI actuals via Excel
        </p>
      </div>

      <Card className="shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Upload File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <Button
              size="sm"
              disabled={uploading || !lookupsReady}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading…" : "Select Excel File"}
            </Button>
          </div>

          {fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="truncate">{fileName}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />

          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Expected columns (case-insensitive):</p>
            <p>
              <code>email</code> — employee email address
            </p>
            <p>
              <code>period</code> — q1, q2, q3, q4, h1, h2, halfyear, or fullyear
            </p>
            <p>
              <code>kpi_title</code> — exact KPI title from the KPI library
            </p>
            <p>
              <code>actual_value</code> — numeric (for progressive / benchmark KPIs)
            </p>
            <p>
              <code>actual_binary</code> — true / false (for binary KPIs)
            </p>
          </div>
        </CardContent>
      </Card>

      <UploadValidationModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setValidationErrors([]);
        }}
        errors={validationErrors}
      />
    </div>
  );
}
