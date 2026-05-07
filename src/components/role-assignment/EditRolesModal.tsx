import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/components/role-assignment/RoleChip";

const ALL_ROLES: { role: UserRole; label: string }[] = [
  { role: "ceo", label: "CEO" },
  { role: "manager", label: "Manager" },
  { role: "hr_rep", label: "HR Rep" },
  { role: "employee", label: "Employee" },
];

const NONE_VALUE = "__none__";

export type FunctionalDepartmentOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: { id: string; first_name: string; last_name: string } | null;
  currentRoles: UserRole[];
  currentFunctionalDepartmentId: string | null;
  functionalDepartments: FunctionalDepartmentOption[];
  entity_id: string;
  onSaved: () => void;
};

export function EditRolesModal({
  open,
  onOpenChange,
  person,
  currentRoles,
  currentFunctionalDepartmentId,
  functionalDepartments,
  entity_id: _entity_id,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<Set<UserRole>>(new Set(currentRoles));
  const [funcDeptId, setFuncDeptId] = useState<string | null>(currentFunctionalDepartmentId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentRoles));
      setFuncDeptId(currentFunctionalDepartmentId);
      setError(null);
    }
  }, [open, currentRoles, currentFunctionalDepartmentId]);

  if (!person) return null;

  const toggle = (role: UserRole, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });
    setError(null);
  };

  const handleSave = async () => {
    const rolesArr = Array.from(selected);
    if (rolesArr.length === 0) {
      setError("A person must have at least one role");
      return;
    }

    setSaving(true);
    try {
      // Fetch current roles
      const { data: currentData, error: fetchErr } = await supabase
        .from("people_roles")
        .select("role")
        .eq("person_id", person.id);
      if (fetchErr) throw new Error(`Failed to load existing roles: ${fetchErr.message}`);

      const existing = new Set((currentData ?? []).map((r) => r.role));
      const next = new Set(selected);
      const toAdd = Array.from(selected).filter((r) => !existing.has(r));
      const toRemove = Array.from(existing).filter((r) => !next.has(r));

      if (toAdd.length > 0) {
        const { error: addErr } = await supabase
          .from("people_roles")
          .insert(toAdd.map((role) => ({ person_id: person.id, role })));
        if (addErr) throw new Error(`Failed to add roles: ${addErr.message}`);
      }
      if (toRemove.length > 0) {
        const { error: delErr } = await supabase
          .from("people_roles")
          .delete()
          .eq("person_id", person.id)
          .in("role", toRemove);
        if (delErr) throw new Error(`Failed to remove roles: ${delErr.message}`);
      }

      // Sync functional department
      const { error: delFuncErr } = await supabase
        .from("people_functional_departments")
        .delete()
        .eq("person_id", person.id);
      if (delFuncErr) throw new Error(`Failed to clear department: ${delFuncErr.message}`);

      if (funcDeptId) {
        const { error: insFuncErr } = await supabase
          .from("people_functional_departments")
          .insert({ person_id: person.id, functional_department_id: funcDeptId });
        if (insFuncErr) throw new Error(`Failed to set department: ${insFuncErr.message}`);
      }

      toast.success("Roles updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update roles");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit Roles — {person.first_name} {person.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-3">
            <Label className="text-sm font-medium">Roles</Label>
            {ALL_ROLES.map(({ role, label }) => (
              <div key={role} className="flex items-center gap-3">
                <Checkbox
                  id={`role-${role}`}
                  checked={selected.has(role)}
                  onCheckedChange={(c) => toggle(role, c === true)}
                  disabled={saving}
                />
                <Label htmlFor={`role-${role}`} className="cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="func-dept" className="text-sm font-medium">
              Function
            </Label>
            <Select
              value={funcDeptId ?? NONE_VALUE}
              onValueChange={(v) => setFuncDeptId(v === NONE_VALUE ? null : v)}
              disabled={saving}
            >
              <SelectTrigger id="func-dept">
                <SelectValue placeholder="Select a function" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                {functionalDepartments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
