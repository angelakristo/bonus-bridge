import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client"; 
import { createEmployeeManually } from "@/integrations/supabase/create-employee.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "ceo" | "manager" | "hr_rep" | "employee";

const ALL_ROLES: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_rep", label: "HR Rep" },
  { value: "ceo", label: "CEO" },
];

type OrgDept = { id: string; name: string };
type FuncDept = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onCreated?: () => void;
};

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  position: "",
  org_department_id: "",
  annual_salary: "",
  employment_start_date: "",
  roles: ["employee"] as Role[],
  functional_department_ids: [] as string[],
};

export function AddEmployeeManuallyModal({
  open,
  onOpenChange,
  entityId,
  onCreated,
}: Props) {
  const createFn = useServerFn(createEmployeeManually);
  const [form, setForm] = useState(EMPTY);
  const [orgDepts, setOrgDepts] = useState<OrgDept[]>([]);
  const [availableFuncDepts, setAvailableFuncDepts] = useState<FuncDept[]>([]);
  const [allFuncDepts, setAllFuncDepts] = useState<FuncDept[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;
    setForm(EMPTY);

    const loadDepts = async () => {
      const [orgRes, funcRes] = await Promise.all([
        supabase
          .from("organisational_departments")
          .select("id, name")
          .eq("entity_id", entityId)
          .order("name"),
        supabase
          .from("functions")
          .select("id, name")
          .order("name"),
      ]);
      if (orgRes.error) toast.error(`Failed to load departments: ${orgRes.error.message}`);
      else setOrgDepts(orgRes.data ?? []);
      if (funcRes.error) toast.error(`Failed to load functions: ${funcRes.error.message}`);
      else setAllFuncDepts(funcRes.data ?? []);
    };
    void loadDepts();
  }, [open, entityId]);

  // Update available functional depts when org dept changes
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
      if (assignedIds.length === 0) {
        setAvailableFuncDepts([]);
        return;
      }
      setAvailableFuncDepts(allFuncDepts.filter((fd) => assignedIds.includes(fd.id)));
    } catch {
      setAvailableFuncDepts(allFuncDepts);
    }
  }, [form.org_department_id, allFuncDepts, entityId]);

  const toggleRole = (role: Role, checked: boolean) => {
    setForm((f) => ({
      ...f,
      roles: checked ? [...f.roles, role] : f.roles.filter((r) => r !== role),
    }));
  };

  const toggleFuncDept = (id: string) => {
    setForm((f) => ({
      ...f,
      functional_department_ids: f.functional_department_ids.includes(id)
        ? f.functional_department_ids.filter((x) => x !== id)
        : [...f.functional_department_ids, id],
    }));
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim()) return toast.error("First name is required.");
    if (!form.last_name.trim()) return toast.error("Last name is required.");
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email))
      return toast.error("Valid email is required.");
    if (!form.org_department_id) return toast.error("Department is required.");
    if (form.roles.length === 0) return toast.error("At least one role is required.");
    if (form.annual_salary && !Number.isFinite(Number(form.annual_salary)))
      return toast.error("Salary must be a number.");
    if (form.employment_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.employment_start_date))
      return toast.error("Date must be YYYY-MM-DD.");

    setSubmitting(true);
    try {
      const result = await createFn({
        data: {
          entity_id: entityId,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          position: form.position.trim() || null,
          annual_salary: form.annual_salary ? Number(form.annual_salary) : null,
          employment_start_date: form.employment_start_date || null,
          roles: form.roles,
          org_department_id: form.org_department_id,
          functional_department_ids: form.functional_department_ids,
        },
      });

      if (!result?.ok) {
        toast.error(result?.error || "Employee creation failed. Please restart the dev server and try again.");
        return;
      }

      toast.success(`${form.first_name} ${form.last_name} added.`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to add employee: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Employee Manually</DialogTitle>
          <DialogDescription>
            Enter the employee's details. They will receive an invite email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <Label htmlFor="position">Position</Label>
            <Input
              id="position"
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              placeholder="e.g. Senior Account Manager"
            />
          </div>

          {/* Org Department */}
          <div className="space-y-1.5">
            <Label htmlFor="org_department">Department *</Label>
            <Select
              value={form.org_department_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, org_department_id: v, functional_department_ids: [] }))
              }
            >
              <SelectTrigger id="org_department">
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {orgDepts.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No departments. Create some first.
                  </div>
                ) : (
                  orgDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Functional Departments */}
          {form.org_department_id && (
            <div className="space-y-1.5">
              <Label>Functions</Label>
              {availableFuncDepts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No functions assigned to this department yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 rounded-md border p-2">
                  {availableFuncDepts.map((fd) => {
                    const checked = form.functional_department_ids.includes(fd.id);
                    return (
                      <label
                        key={fd.id}
                        className="flex cursor-pointer items-center gap-1.5 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleFuncDept(fd.id)}
                        />
                        {fd.name}
                      </label>
                    );
                  })}
                </div>
              )}
              {form.functional_department_ids.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.functional_department_ids.map((id) => {
                    const name = allFuncDepts.find((f) => f.id === id)?.name ?? id;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 text-xs">
                        {name}
                        <button
                          type="button"
                          onClick={() => toggleFuncDept(id)}
                          className="ml-0.5 rounded hover:bg-muted"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Roles */}
          <div className="space-y-1.5">
            <Label>Roles *</Label>
            <div className="flex flex-wrap gap-4 rounded-md border p-3">
              {ALL_ROLES.map(({ value, label }) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.roles.includes(value)}
                    onCheckedChange={(c) => toggleRole(value, c === true)}
                    disabled={submitting}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Salary + Start date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="annual_salary">Annual salary</Label>
              <Input
                id="annual_salary"
                inputMode="decimal"
                value={form.annual_salary}
                onChange={(e) => setForm((f) => ({ ...f, annual_salary: e.target.value }))}
                placeholder="75000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employment_start_date">Start date</Label>
              <Input
                id="employment_start_date"
                placeholder="YYYY-MM-DD"
                value={form.employment_start_date}
                onChange={(e) => setForm((f) => ({ ...f, employment_start_date: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
