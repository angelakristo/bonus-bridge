import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx-js-style";
import { Download, Upload as UploadIcon, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { supabase } from "@/integrations/supabase/client";
import { commitEmployeeUpload } from "@/integrations/supabase/employee-upload.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadValidationModal } from "@/components/employee-upload/UploadValidationModal";

export const Route = createFileRoute("/_authenticated/_setupLayout/employee-upload")({
  component: EmployeeUploadPage,
});

const HEADERS = [
  "employee_reference",
  "first_name",
  "last_name",
  "email",
  "org_department",
  "annual_salary",
  "employment_start_date",
  "role",
] as const;

type FieldName = (typeof HEADERS)[number];

const REQUIRED_FIELDS: FieldName[] = [
  "first_name",
  "last_name",
  "email",
  "org_department",
  "role",
];

const VALID_ROLES = new Set(["ceo", "manager", "hr_rep", "employee"]);

const EXAMPLE_ROW: (string | number)[] = [
  "EMP001",
  "Jane",
  "Smith",
  "jane.smith@company.com",
  "HQ — Commercial",
  75000,
  "2024-01-15",
  "employee",
];

type ValidationError = { row: number; field: string; error: string };

function downloadEmployeeTemplate() {
  const aoa: (string | number)[][] = [HEADERS as unknown as string[], EXAMPLE_ROW];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const headerStyle = {
    font: { bold: true, color: { rgb: "000000" } },
    alignment: { horizontal: "left" as const, vertical: "center" as const },
  };
  const exampleStyle = { font: { italic: true, color: { rgb: "808080" } } };

  for (let c = 0; c < HEADERS.length; c++) {
    const headerAddr = XLSX.utils.encode_cell({ r: 0, c });
    const exampleAddr = XLSX.utils.encode_cell({ r: 1, c });
    if (ws[headerAddr]) ws[headerAddr].s = headerStyle;
    if (ws[exampleAddr]) ws[exampleAddr].s = exampleStyle;
  }

  ws["!cols"] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "bonusbridge_employee_template.xlsx");
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

const FIELD_ORDER: Record<string, number> = HEADERS.reduce(
  (acc, h, i) => ({ ...acc, [h]: i }),
  {} as Record<string, number>,
);

function EmployeeUploadPage() {
  const { roles, person } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");
  const commitFn = useServerFn(commitEmployeeUpload);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
  };

  const handleUpload = async () => {
    if (!selectedFile || !entity_id) return;
    setIsValidating(true);
    try {
      const buf = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames.includes("Employees") ? "Employees" : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });

      if (aoa.length < 2) {
        toast.info("No data rows found in the file.");
        setIsValidating(false);
        return;
      }

      const headerRow = aoa[0].map((h) => String(h ?? "").trim());
      const colIndex: Partial<Record<FieldName, number>> = {};
      HEADERS.forEach((h) => {
        const idx = headerRow.indexOf(h);
        if (idx >= 0) colIndex[h] = idx;
      });

      type ParsedRow = { row: number; values: Record<FieldName, string> };
      const dataRows: ParsedRow[] = [];
      let dataRowNum = 0;

      for (let i = 1; i < aoa.length; i++) {
        const raw = aoa[i] ?? [];
        const values = {} as Record<FieldName, string>;
        HEADERS.forEach((h) => {
          const idx = colIndex[h];
          values[h] = idx !== undefined ? cellToString(raw[idx]) : "";
        });

        const allBlank = HEADERS.every((h) => values[h] === "");
        if (allBlank) continue;

        const isExample =
          values.employee_reference === "EMP001" &&
          values.first_name === "Jane" &&
          values.email === "jane.smith@company.com";
        if (isExample) continue;

        dataRowNum++;
        dataRows.push({ row: dataRowNum, values });
      }

      if (dataRows.length === 0) {
        toast.info("No employee rows to validate.");
        setIsValidating(false);
        return;
      }

      const collected: ValidationError[] = [];

      // Batch fetches
      const emails = dataRows
        .map((r) => r.values.email.toLowerCase())
        .filter((e) => e.length > 0);

      const [existingEmailsRes, orgDeptRes] = await Promise.all([
        emails.length > 0
          ? supabase.from("people").select("email").eq("entity_id", entity_id).in("email", emails)
          : Promise.resolve({ data: [] as { email: string }[], error: null }),
        supabase.from("organisational_departments").select("name").eq("entity_id", entity_id),
      ]);

      if (existingEmailsRes.error) throw existingEmailsRes.error;
      if (orgDeptRes.error) throw orgDeptRes.error;

      const existingEmails = new Set(
        (existingEmailsRes.data ?? []).map((r) => (r.email ?? "").toLowerCase().trim()),
      );
      const orgDeptNames = new Set((orgDeptRes.data ?? []).map((r) => r.name));

      const seenEmails = new Set<string>();

      for (const { row, values } of dataRows) {
        // 1. Required fields
        for (const f of REQUIRED_FIELDS) {
          if (values[f].trim() === "") {
            collected.push({ row, field: f, error: `Required field missing: ${f}` });
          }
        }

        // 2. Duplicate email
        const emailKey = values.email.toLowerCase();
        if (emailKey) {
          if (existingEmails.has(emailKey) || seenEmails.has(emailKey)) {
            collected.push({ row, field: "email", error: "Duplicate email" });
          }
          seenEmails.add(emailKey);
        }

        // 3. Org department
        if (values.org_department && !orgDeptNames.has(values.org_department)) {
          collected.push({
            row,
            field: "org_department",
            error: `Org department not found: ${values.org_department}`,
          });
        }

        // 4. Salary numeric
        if (values.annual_salary !== "") {
          if (!Number.isFinite(Number(values.annual_salary))) {
            collected.push({
              row,
              field: "annual_salary",
              error: "Salary must be a number",
            });
          }
        }

        // 5. Date valid
        if (values.employment_start_date !== "") {
          const v = values.employment_start_date;
          const matches = /^\d{4}-\d{2}-\d{2}$/.test(v);
          const parsed = matches ? new Date(v) : null;
          const valid = matches && parsed !== null && !Number.isNaN(parsed.getTime());
          if (!valid) {
            collected.push({
              row,
              field: "employment_start_date",
              error: "Invalid date format, use YYYY-MM-DD",
            });
          }
        }

        // 6. Role enum
        if (values.role && !VALID_ROLES.has(values.role.toLowerCase())) {
          collected.push({ row, field: "role", error: "Invalid role value" });
        }
      }

      collected.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return (FIELD_ORDER[a.field] ?? 99) - (FIELD_ORDER[b.field] ?? 99);
      });

      if (collected.length > 0) {
        setErrors(collected);
        setModalOpen(true);
        return;
      }

      if (!person?.id) {
        toast.error("Cannot identify uploader. Please re-login.");
        return;
      }

      const payload = dataRows.map(({ values }) => ({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim().toLowerCase(),
        annual_salary: values.annual_salary.trim(),
        employment_start_date: values.employment_start_date.trim(),
        role: values.role.trim().toLowerCase() as
          | "ceo"
          | "manager"
          | "hr_rep"
          | "employee",
        org_department: values.org_department.trim(),
      }));

      setIsCommitting(true);
      try {
        const result = await commitFn({
          data: {
            entity_id,
            uploaded_by_person_id: person.id,
            file_name: selectedFile.name,
            rows: payload,
          },
        });

        if (result.partialError) {
          toast.error(
            `${result.partialError} (${result.inserted} of ${payload.length} rows inserted before failure.)`,
          );
        } else {
          toast.success(
            `${result.inserted} employees uploaded successfully. Invite emails sent.`,
          );
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }

        if (result.inviteFailures.length > 0) {
          const preview = result.inviteFailures
            .slice(0, 3)
            .map((f) => f.email)
            .join(", ");
          const more =
            result.inviteFailures.length > 3
              ? ` and ${result.inviteFailures.length - 3} more`
              : "";
          toast.warning(`Invite email failed for: ${preview}${more}.`);
        }
      } catch (commitErr) {
        console.error("[EmployeeUpload] commit error", commitErr);
        toast.error("Failed to upload employees. Please try again.");
      } finally {
        setIsCommitting(false);
      }
    } catch (err) {
      console.error("[EmployeeUpload] parse error", err);
      toast.error("Failed to read file. Please ensure it is a valid .xlsx.");
    } finally {
      setIsValidating(false);
    }
  };

  const entityReady = !!entity_id && !entityLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employee Upload</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-import your employee roster in two steps.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Download Template</CardTitle>
          <CardDescription>
            Download the template, fill it with your employee data, then upload it in Step 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadEmployeeTemplate}>
            <Download className="h-4 w-4" />
            Download Employee Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2 — Upload Completed Template</CardTitle>
          <CardDescription>
            Choose your filled-in <code>.xlsx</code> file and click Upload. We'll validate every
            row before importing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isValidating || isCommitting}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Choose file
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedFile ? selectedFile.name : "No file selected"}
            </span>
          </div>
          <div>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isValidating || isCommitting || !entityReady}
            >
              {isValidating || isCommitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadIcon className="h-4 w-4" />
              )}
              {isValidating ? "Validating…" : isCommitting ? "Uploading…" : "Upload"}
            </Button>
            {!entityReady && (
              <p className="mt-2 text-xs text-muted-foreground">Loading entity…</p>
            )}
          </div>
        </CardContent>
      </Card>

      <UploadValidationModal open={modalOpen} onOpenChange={setModalOpen} errors={errors} />
    </div>
  );
}
