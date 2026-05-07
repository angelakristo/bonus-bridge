import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as XLSX from "xlsx-js-style";
import {
  Loader2,
  ArrowRight,
  UserPlus,
  Download,
  FileSpreadsheet,
  Upload as UploadIcon,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadValidationModal } from "@/components/employee-upload/UploadValidationModal";
import { AddEmployeeManuallyModal } from "@/components/employee-upload/AddEmployeeManuallyModal";
import { RoleChip } from "@/components/role-assignment/RoleChip";
import type { UserRole } from "@/components/role-assignment/RoleChip";

export const Route = createFileRoute("/_authenticated/_setupLayout/team-setup")({
  component: TeamSetupPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  position: string | null;
  annual_salary: number | null;
  employment_start_date: string | null;
  roles: UserRole[];
  org_department_id: string | null;
  org_department_name: string | null;
  functional_department_ids: string[];
  functional_department_names: string[];
};

type PendingEdit = {
  first_name: string;
  last_name: string;
  email: string;
  position: string | null;
  annual_salary: number | null;
  employment_start_date: string | null;
  roles: UserRole[];
  org_department_id: string | null;
  functional_department_ids: string[];
};

type OrgDept = { id: string; name: string };
type FuncDept = { id: string; name: string };

// ─── Excel template ───────────────────────────────────────────────────────────

const UPLOAD_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "department",
] as const;

// downloadTemplate is defined inside TeamSetupPage so it can use loaded orgDepts.

// ─── ALL_ROLES constant ───────────────────────────────────────────────────────

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_rep", label: "HR Rep" },
  { value: "ceo", label: "CEO" },
];

// ─── EditEmployeeModal ────────────────────────────────────────────────────────

type EditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: PersonRow | null;
  pending: PendingEdit | null;
  orgDepts: OrgDept[];
  allFuncDepts: FuncDept[];
  entityId: string;
  onSave: (personId: string, edit: PendingEdit) => void;
};

function EditEmployeeModal({
  open,
  onOpenChange,
  person,
  pending,
  orgDepts,
  allFuncDepts,
  entityId,
  onSave,
}: EditModalProps) {
  const [form, setForm] = useState<PendingEdit>({
    first_name: "",
    last_name: "",
    email: "",
    position: null,
    annual_salary: null,
    employment_start_date: null,
    roles: [],
    org_department_id: null,
    functional_department_ids: [],
  });
  const [availableFuncDepts, setAvailableFuncDepts] = useState<FuncDept[]>([]);

  useEffect(() => {
    if (!open || !person) return;
    const source = pending ?? {
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      position: person.position,
      annual_salary: person.annual_salary,
      employment_start_date: person.employment_start_date,
      roles: person.roles,
      org_department_id: person.org_department_id,
      functional_department_ids: person.functional_department_ids,
    };
    setForm(source);
  }, [open, person, pending]);

  // Compute available functional departments when org dept changes
  useEffect(() => {
    if (!form.org_department_id || !entityId) {
      setAvailableFuncDepts([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`bb_dept_setup_${entityId}`);
      if (!raw) {
        setAvailableFuncDepts(allFuncDepts);
        return;
      }
      const stored = JSON.parse(raw) as { assignments: Record<string, string[]> };
      const assignedIds = stored.assignments[form.org_department_id] ?? [];
      setAvailableFuncDepts(
        assignedIds.length > 0
          ? allFuncDepts.filter((fd) => assignedIds.includes(fd.id))
          : [],
      );
    } catch {
      setAvailableFuncDepts(allFuncDepts);
    }
  }, [form.org_department_id, allFuncDepts, entityId]);

  if (!person) return null;

  const toggleRole = (role: UserRole, checked: boolean) =>
    setForm((f) => ({
      ...f,
      roles: checked ? [...f.roles, role] : f.roles.filter((r) => r !== role),
    }));

  const toggleFuncDept = (id: string) =>
    setForm((f) => ({
      ...f,
      functional_department_ids: f.functional_department_ids.includes(id)
        ? f.functional_department_ids.filter((x) => x !== id)
        : [...f.functional_department_ids, id],
    }));

  const handleSave = () => {
    if (!form.first_name.trim()) return toast.error("First name is required.");
    if (!form.last_name.trim()) return toast.error("Last name is required.");
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email))
      return toast.error("Valid email is required.");
    if (form.roles.length === 0) return toast.error("At least one role is required.");
    onSave(person.id, {
      ...form,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim().toLowerCase(),
      position: form.position?.trim() || null,
      // Strip functional depts that are no longer available for the selected org dept
      functional_department_ids: form.functional_department_ids.filter((id) =>
        availableFuncDepts.some((fd) => fd.id === id),
      ),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Employee — {person.first_name} {person.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name *</Label>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last name *</Label>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Position</Label>
            <Input
              placeholder="e.g. Senior Sales Manager"
              value={form.position ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value || null }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={form.org_department_id ?? ""}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, org_department_id: v || null, functional_department_ids: [] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {orgDepts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.org_department_id && (
            <div className="space-y-1.5">
              <Label>Functions</Label>
              {availableFuncDepts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No functions assigned to this department.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3 rounded-md border p-2">
                  {availableFuncDepts.map((fd) => (
                    <label key={fd.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={form.functional_department_ids.includes(fd.id)}
                        onCheckedChange={() => toggleFuncDept(fd.id)}
                      />
                      {fd.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Roles *</Label>
            <div className="flex flex-wrap gap-4 rounded-md border p-3">
              {ALL_ROLES.map(({ value, label }) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.roles.includes(value)}
                    onCheckedChange={(c) => toggleRole(value, c === true)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Annual salary</Label>
              <Input
                inputMode="decimal"
                placeholder="75000"
                value={form.annual_salary ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    annual_salary: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                placeholder="YYYY-MM-DD"
                value={form.employment_start_date ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employment_start_date: e.target.value || null }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function TeamSetupPage() {
  const { roles, person } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [orgDepts, setOrgDepts] = useState<OrgDept[]>([]);
  const [allFuncDepts, setAllFuncDepts] = useState<FuncDept[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ row: number; field: string; error: string }[]>([]);
  const [validationOpen, setValidationOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ─── Load employees ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!entity_id) return;
    setLoading(true);

    const [peopleRes, rolesRes, orgLinksRes, funcLinksRes, orgDeptsRes, funcDeptsRes] =
      await Promise.all([
        supabase
          .from("people")
          .select("id, first_name, last_name, email, annual_salary, employment_start_date")
          .eq("entity_id", entity_id)
          .eq("is_active", true)
          .order("last_name"),
        supabase.from("people_roles").select("person_id, role"),
        supabase
          .from("people_org_departments")
          .select("person_id, org_department_id"),
        supabase
          .from("people_functional_departments")
          .select("person_id, functional_department_id"),
        supabase.from("organisational_departments").select("id, name").eq("entity_id", entity_id).order("name"),
        supabase.from("functions").select("id, name").order("name"),
      ]);

    if (peopleRes.error) {
      toast.error(`Failed to load employees: ${peopleRes.error.message}`);
      setLoading(false);
      return;
    }

    const localOrgDepts = orgDeptsRes.data ?? [];
    const localFuncDepts = funcDeptsRes.data ?? [];
    const orgDeptMap = new Map(localOrgDepts.map((d) => [d.id, d.name]));
    const funcDeptMap = new Map(localFuncDepts.map((d) => [d.id, d.name]));

    // Fetch positions separately since types.ts may lag behind migration
    const posRes = await supabase
      .from("people")
      .select("id, position")
      .eq("entity_id", entity_id)
      .eq("is_active", true);
    const posMap = new Map(
      (posRes.data ?? []).map((p) => [p.id, (p as unknown as { position: string | null }).position]),
    );

    const personIds = (peopleRes.data ?? []).map((p) => p.id);

    // Build lookup maps scoped to these people
    const rolesMap = new Map<string, UserRole[]>();
    const orgLinkMap = new Map<string, string>();
    const funcLinksMap = new Map<string, string[]>();

    for (const id of personIds) {
      rolesMap.set(id, []);
      funcLinksMap.set(id, []);
    }

    for (const r of rolesRes.data ?? []) {
      if (rolesMap.has(r.person_id)) rolesMap.get(r.person_id)!.push(r.role as UserRole);
    }
    for (const o of orgLinksRes.data ?? []) {
      orgLinkMap.set(o.person_id, o.org_department_id);
    }
    for (const f of funcLinksRes.data ?? []) {
      if (funcLinksMap.has(f.person_id)) funcLinksMap.get(f.person_id)!.push(f.functional_department_id);
    }

    setPeople(
      (peopleRes.data ?? []).map((p) => {
        const orgDeptId = orgLinkMap.get(p.id) ?? null;
        const funcIds = funcLinksMap.get(p.id) ?? [];
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          position: posMap.get(p.id) ?? null,
          annual_salary: p.annual_salary,
          employment_start_date: p.employment_start_date,
          roles: rolesMap.get(p.id) ?? [],
          org_department_id: orgDeptId,
          org_department_name: orgDeptId ? (orgDeptMap.get(orgDeptId) ?? null) : null,
          functional_department_ids: funcIds,
          functional_department_names: funcIds.map((id) => funcDeptMap.get(id) ?? id),
        };
      }),
    );

    if (!orgDeptsRes.error) setOrgDepts(localOrgDepts);
    if (!funcDeptsRes.error) setAllFuncDepts(localFuncDepts);

    setLoading(false);
  }, [entity_id]);

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed, load]);

  // ─── Edit buffering ──────────────────────────────────────────────────────────
  const editingPerson = useMemo(
    () => people.find((p) => p.id === editingId) ?? null,
    [people, editingId],
  );

  const handleEditSave = (personId: string, edit: PendingEdit) => {
    setPendingEdits((prev) => ({ ...prev, [personId]: edit }));
  };

  const pendingCount = Object.keys(pendingEdits).length;

  // ─── Confirm edits ───────────────────────────────────────────────────────────
  const handleConfirmEdits = async () => {
    if (pendingCount === 0) return;
    setConfirming(true);
    try {
      let updated = 0;
      const failMsgs: string[] = [];

      for (const [person_id, edit] of Object.entries(pendingEdits)) {
        // 1. Update core fields
        const { error: peopleErr } = await supabase
          .from("people")
          .update({
            first_name: edit.first_name,
            last_name: edit.last_name,
            email: edit.email,
            position: edit.position,
            annual_salary: edit.annual_salary,
            employment_start_date: edit.employment_start_date,
          })
          .eq("id", person_id);

        if (peopleErr) {
          failMsgs.push(`${edit.first_name} ${edit.last_name}: ${peopleErr.message}`);
          continue;
        }

        // 2. Sync roles (fetch existing, diff, add/remove)
        const { data: existingRoles } = await supabase
          .from("people_roles")
          .select("role")
          .eq("person_id", person_id);

        const existingSet = new Set((existingRoles ?? []).map((r) => r.role));
        const nextSet = new Set(edit.roles);
        const toAdd = edit.roles.filter((r) => !existingSet.has(r));
        const toRemove = [...existingSet].filter((r) => !nextSet.has(r));

        if (toAdd.length > 0) {
          await supabase.from("people_roles").insert(toAdd.map((role) => ({ person_id, role })));
        }
        if (toRemove.length > 0) {
          await supabase.from("people_roles").delete().eq("person_id", person_id).in("role", toRemove);
        }

        // 3. Sync org department (replace)
        await supabase.from("people_org_departments").delete().eq("person_id", person_id);
        if (edit.org_department_id) {
          await supabase
            .from("people_org_departments")
            .insert({ person_id, org_department_id: edit.org_department_id });
        }

        // 4. Sync functional departments (replace)
        await supabase.from("people_functional_departments").delete().eq("person_id", person_id);
        if (edit.functional_department_ids.length > 0) {
          await supabase.from("people_functional_departments").insert(
            edit.functional_department_ids.map((fd_id) => ({
              person_id,
              functional_department_id: fd_id,
            })),
          );
        }

        updated++;
      }

      if (failMsgs.length > 0) {
        toast.error(`Some updates failed: ${failMsgs.slice(0, 3).join("; ")}`);
      } else {
        toast.success(`${updated} employee${updated === 1 ? "" : "s"} updated.`);
        setPendingEdits({});
        await load();
      }
    } catch (err) {
      toast.error(`Failed to save edits: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConfirming(false);
    }
  };

  // ─── Proceed ─────────────────────────────────────────────────────────────────
  const handleProceed = async () => {
    if (!entity_id) return;
    if (pendingCount > 0) {
      toast.warning("You have unsaved edits. Please confirm your edits before proceeding.");
      return;
    }
    setProceeding(true);
    try {
      const { error } = await supabase.from("setup_progress").upsert(
        { entity_id, step_key: "team_setup", status: "complete", updated_at: new Date().toISOString() },
        { onConflict: "entity_id,step_key" },
      );
      if (error) throw error;
      navigate({ to: "/kpi-setup" });
    } catch {
      toast.error("Failed to proceed. Please try again.");
    } finally {
      setProceeding(false);
    }
  };

  // ─── Excel upload ─────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const exampleDept = orgDepts[0]?.name ?? "HQ Corporate";
    const aoa = [
      [...UPLOAD_HEADERS],
      ["Jane", "Smith", "jane.smith@company.com", exampleDept],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const bold = { font: { bold: true } };
    const italic = { font: { italic: true, color: { rgb: "808080" } } };
    for (let c = 0; c < UPLOAD_HEADERS.length; c++) {
      const h = XLSX.utils.encode_cell({ r: 0, c });
      const e = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[h]) ws[h].s = bold;
      if (ws[e]) ws[e].s = italic;
    }
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "bonusbridge_employee_template.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !entity_id || !person?.id) {
      toast.error("Missing required data for upload");
      return;
    }

    setIsUploading(true);
    console.log("[Upload] Starting upload:", selectedFile.name);

    try {
      // ── Step 1: Parse Excel ────────────────────────────────────────────────
      const buf = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames.includes("Employees") ? "Employees" : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });

      console.log("[Upload] Sheet rows:", aoa.length);

      if (aoa.length < 2) {
        toast.error("No data rows found in spreadsheet");
        return;
      }

      // ── Step 2: Resolve headers ────────────────────────────────────────────
      const headerRow = (aoa[0] as unknown[]).map((h) => String(h ?? "").toLowerCase().trim());
      console.log("[Upload] Headers:", headerRow);

      const headerMap: Record<string, string> = {
        first_name: "first_name", "first name": "first_name", firstname: "first_name",
        last_name: "last_name", "last name": "last_name", lastname: "last_name",
        email: "email", "email address": "email",
        department: "department", dept: "department",
      };

      const colIndex: Record<string, number> = {};
      ["first_name", "last_name", "email", "department"].forEach((field) => {
        const idx = headerRow.findIndex((h) => headerMap[h] === field);
        if (idx >= 0) colIndex[field] = idx;
      });

      console.log("[Upload] Column mapping:", colIndex);

      const missing = ["first_name", "last_name", "email", "department"].filter(
        (f) => colIndex[f] === undefined,
      );
      if (missing.length > 0) {
        toast.error(`Missing required columns: ${missing.join(", ")}`);
        return;
      }

      // ── Step 3: Parse data rows ────────────────────────────────────────────
      type UploadRow = { first_name: string; last_name: string; email: string; department: string };
      const dataRows: UploadRow[] = [];

      for (let i = 1; i < aoa.length; i++) {
        const raw = aoa[i] as unknown[];
        const row: UploadRow = {
          first_name: String(raw[colIndex.first_name] ?? "").trim(),
          last_name: String(raw[colIndex.last_name] ?? "").trim(),
          email: String(raw[colIndex.email] ?? "").toLowerCase().trim(),
          department: String(raw[colIndex.department] ?? "").trim(),
        };
        if (!row.first_name && !row.last_name && !row.email && !row.department) continue;
        // Skip the template example row
        if (row.first_name === "Jane" && row.email === "jane.smith@company.com") continue;
        dataRows.push(row);
      }

      console.log("[Upload] Parsed rows:", dataRows.length, dataRows);

      if (dataRows.length === 0) {
        toast.error("No employee rows found — fill in data below the header row.");
        return;
      }

      // ── Step 4: Validate against DB ───────────────────────────────────────
      const [emailRes, orgRes] = await Promise.all([
        supabase.from("people").select("email").eq("entity_id", entity_id),
        supabase.from("organisational_departments").select("name").eq("entity_id", entity_id),
      ]);

      if (emailRes.error) throw new Error(`Email check failed: ${emailRes.error.message}`);
      if (orgRes.error) throw new Error(`Department check failed: ${orgRes.error.message}`);

      const existingEmails = new Set((emailRes.data ?? []).map((r) => r.email.toLowerCase()));
      const validDepts = new Set((orgRes.data ?? []).map((r) => r.name));

      console.log("[Upload] Valid departments:", [...validDepts]);
      console.log("[Upload] Existing emails:", existingEmails.size);

      const validationErrors: { row: number; field: string; error: string }[] = [];
      const seenEmails = new Set<string>();

      dataRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        if (!row.first_name) validationErrors.push({ row: rowNum, field: "first_name", error: "Missing first name" });
        if (!row.last_name) validationErrors.push({ row: rowNum, field: "last_name", error: "Missing last name" });
        if (!row.email) validationErrors.push({ row: rowNum, field: "email", error: "Missing email" });
        if (!row.department) validationErrors.push({ row: rowNum, field: "department", error: "Missing department" });
        if (row.email) {
          if (existingEmails.has(row.email))
            validationErrors.push({ row: rowNum, field: "email", error: `Email already exists: ${row.email}` });
          if (seenEmails.has(row.email))
            validationErrors.push({ row: rowNum, field: "email", error: `Duplicate email: ${row.email}` });
          seenEmails.add(row.email);
        }
        if (row.department && !validDepts.has(row.department)) {
          console.log(`[Upload] Row ${rowNum} dept mismatch: "${row.department}" not in`, [...validDepts]);
          validationErrors.push({
            row: rowNum,
            field: "department",
            error: `Department "${row.department}" not found. Valid: ${[...validDepts].join(", ")}`,
          });
        }
      });

      if (validationErrors.length > 0) {
        setValidationErrors(validationErrors);
        setValidationOpen(true);
        return;
      }

      // ── Step 5 & 6: Direct Supabase inserts ──────────────────────────────
      const orgDeptNameMap = new Map(orgDepts.map((d) => [d.name, d.id]));
      let inserted = 0;
      let partialError: string | undefined;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const orgId = orgDeptNameMap.get(row.department);
        if (!orgId) {
          partialError = `Row ${i + 2}: Department "${row.department}" not found`;
          break;
        }

        const { data: personData, error: personError } = await supabase
          .from("people")
          .insert({
            entity_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            is_active: true,
          })
          .select("id")
          .single();

        if (personError || !personData) {
          partialError = `Row ${i + 2}: Failed to insert ${row.email}: ${personError?.message ?? "unknown"}`;
          break;
        }

        const personId = personData.id;

        const { error: roleError } = await supabase
          .from("people_roles")
          .insert({ person_id: personId, role: "employee" });

        if (roleError) {
          await supabase.from("people").delete().eq("id", personId);
          partialError = `Row ${i + 2}: Failed to assign role to ${row.email}: ${roleError.message}`;
          break;
        }

        const { error: orgError } = await supabase
          .from("people_org_departments")
          .insert({ person_id: personId, org_department_id: orgId });

        if (orgError) {
          await supabase.from("people_roles").delete().eq("person_id", personId);
          await supabase.from("people").delete().eq("id", personId);
          partialError = `Row ${i + 2}: Failed to link ${row.email} to department: ${orgError.message}`;
          break;
        }

        inserted++;
      }

      await load();

      if (partialError) {
        toast.error(`Upload failed: ${partialError}`);
      } else if (inserted > 0) {
        toast.success(`${inserted} employee${inserted === 1 ? "" : "s"} uploaded successfully`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        toast.error("No employees were uploaded.");
      }
    } catch (err) {
      console.error("[Upload] Exception:", err);
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Access guard ─────────────────────────────────────────────────────────────
  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  const entityReady = !!entity_id && !entityLoading;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team Setup</h1>
          <p className="text-sm text-muted-foreground">
            Add employees, assign roles and functions.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={!entityReady}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {/* Employee table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : people.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-sm">
              No employees yet. Add them manually or upload via spreadsheet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Functions</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead className="w-20 text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((p) => {
                    const edit = pendingEdits[p.id];
                    const hasPending = !!edit;
                    const display = edit
                      ? {
                          ...p,
                          first_name: edit.first_name,
                          last_name: edit.last_name,
                          email: edit.email,
                          position: edit.position,
                          annual_salary: edit.annual_salary,
                          employment_start_date: edit.employment_start_date,
                          roles: edit.roles,
                          org_department_name:
                            orgDepts.find((d) => d.id === edit.org_department_id)?.name ?? null,
                          functional_department_names: edit.functional_department_ids.map(
                            (id) => allFuncDepts.find((fd) => fd.id === id)?.name ?? id,
                          ),
                        }
                      : p;

                    return (
                      <TableRow key={p.id} className={hasPending ? "bg-amber-50 dark:bg-amber-950/20" : undefined}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {hasPending && (
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                            {display.first_name} {display.last_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{display.email}</TableCell>
                        <TableCell className="text-sm">{display.position ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm">
                          {display.org_department_name ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {display.functional_department_names.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {display.functional_department_names.map((name) => (
                                <Badge key={name} variant="secondary" className="text-xs">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {display.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {display.roles.map((r) => (
                                <RoleChip key={r} role={r} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {display.annual_salary != null
                            ? display.annual_salary.toLocaleString()
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {display.employment_start_date ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(p.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Pending edits banner */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <span className="font-medium text-amber-800 dark:text-amber-300">
            {pendingCount} unsaved {pendingCount === 1 ? "change" : "changes"}
          </span>
          <Button size="sm" onClick={handleConfirmEdits} disabled={confirming}>
            {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm Team Setup Edits
          </Button>
        </div>
      )}

      {/* Excel upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk Upload via Spreadsheet</CardTitle>
          <CardDescription>
            Download the template, fill it in, then upload to import multiple employees at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Choose file
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedFile ? selectedFile.name : "No file selected"}
            </span>
          </div>

          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || !entityReady}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadIcon className="mr-2 h-4 w-4" />
            )}
            Upload Employees
          </Button>
        </CardContent>
      </Card>

      {/* Proceed */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleProceed} disabled={proceeding || !entity_id}>
          {proceeding ? "Saving..." : "Proceed to Set Driver Weightings"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Modals */}
      {entity_id && person?.id && (
        <AddEmployeeManuallyModal
          open={addOpen}
          onOpenChange={setAddOpen}
          entityId={entity_id}
          onCreated={() => { setAddOpen(false); void load(); }}
        />
      )}

      <EditEmployeeModal
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        person={editingPerson}
        pending={editingId ? (pendingEdits[editingId] ?? null) : null}
        orgDepts={orgDepts}
        allFuncDepts={allFuncDepts}
        entityId={entity_id ?? ""}
        onSave={handleEditSave}
      />

      <UploadValidationModal
        open={validationOpen}
        onOpenChange={setValidationOpen}
        errors={validationErrors}
      />
    </div>
  );
}
