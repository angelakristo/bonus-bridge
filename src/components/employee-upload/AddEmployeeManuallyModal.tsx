import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { commitEmployeeUpload } from "@/integrations/supabase/employee-upload.functions";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "ceo" | "manager" | "hr_rep" | "employee";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  uploaderPersonId: string;
  onCreated?: () => void;
};

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  org_department: "",
  annual_salary: "",
  employment_start_date: "",
  role: "employee" as Role,
};

export function AddEmployeeManuallyModal({
  open,
  onOpenChange,
  entityId,
  uploaderPersonId,
  onCreated,
}: Props) {
  const commitFn = useServerFn(commitEmployeeUpload);
  const [form, setForm] = useState(EMPTY);
  const [orgDepts, setOrgDepts] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;
    setForm(EMPTY);
    supabase
      .from("organisational_departments")
      .select("id, name")
      .eq("entity_id", entityId)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error(`Failed to load departments: ${error.message}`);
          return;
        }
        setOrgDepts(data ?? []);
      });
  }, [open, entityId]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    // Client-side validation
    if (!form.first_name.trim()) return toast.error("First name is required.");
    if (!form.last_name.trim()) return toast.error("Last name is required.");
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email))
      return toast.error("Valid email is required.");
    if (!form.org_department) return toast.error("Org department is required.");
    if (form.annual_salary && !Number.isFinite(Number(form.annual_salary)))
      return toast.error("Salary must be a number.");
    if (
      form.employment_start_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(form.employment_start_date)
    )
      return toast.error("Date must be YYYY-MM-DD.");

    setSubmitting(true);
    try {
      const result = await commitFn({
        data: {
          entity_id: entityId,
          uploaded_by_person_id: uploaderPersonId,
          file_name: "manual_entry",
          rows: [
            {
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              email: form.email.trim().toLowerCase(),
              annual_salary: form.annual_salary.trim(),
              employment_start_date: form.employment_start_date.trim(),
              role: form.role,
              org_department: form.org_department,
            },
          ],
        },
      });

      if (result?.partialError) {
        toast.error(result.partialError);
        return;
      }
      if ((result?.inserted ?? 0) === 0) {
        toast.error("Employee was not created.");
        return;
      }

      toast.success(`${form.first_name} ${form.last_name} added.`);
      const inviteFailed = (result?.inviteFailures ?? []).length > 0;
      if (inviteFailed) toast.warning("Invite email failed to send.");

      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      let detail = "";
      if (err instanceof Response) {
        try {
          detail = await err.text();
        } catch {
          detail = `HTTP ${err.status}`;
        }
      } else if (err instanceof Error) {
        detail = err.message;
      } else {
        detail = String(err);
      }
      toast.error(`Failed to add employee: ${detail || "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Employee Manually</DialogTitle>
          <DialogDescription>
            Enter the employee's details. They will receive an invite email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org_department">Org department *</Label>
            <Select
              value={form.org_department}
              onValueChange={(v) => update("org_department", v)}
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
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Role *</Label>
            <Select value={form.role} onValueChange={(v) => update("role", v as Role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="hr_rep">HR Rep</SelectItem>
                <SelectItem value="ceo">CEO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="annual_salary">Annual salary</Label>
              <Input
                id="annual_salary"
                inputMode="decimal"
                value={form.annual_salary}
                onChange={(e) => update("annual_salary", e.target.value)}
                placeholder="75000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employment_start_date">Start date</Label>
              <Input
                id="employment_start_date"
                placeholder="YYYY-MM-DD"
                value={form.employment_start_date}
                onChange={(e) => update("employment_start_date", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
