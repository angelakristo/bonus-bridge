import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { updatePersonRoles } from "@/integrations/supabase/role-assignment.functions";
import type { UserRole } from "@/components/role-assignment/RoleChip";

const ALL_ROLES: { role: UserRole; label: string }[] = [
  { role: "ceo", label: "CEO" },
  { role: "manager", label: "Manager" },
  { role: "hr_rep", label: "HR Rep" },
  { role: "employee", label: "Employee" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: { id: string; first_name: string; last_name: string } | null;
  currentRoles: UserRole[];
  entity_id: string;
  onSaved: () => void;
};

export function EditRolesModal({
  open,
  onOpenChange,
  person,
  currentRoles,
  entity_id,
  onSaved,
}: Props) {
  const updateFn = useServerFn(updatePersonRoles);
  const [selected, setSelected] = useState<Set<UserRole>>(new Set(currentRoles));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentRoles));
      setError(null);
    }
  }, [open, currentRoles]);

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
      const result = await updateFn({
        data: { person_id: person.id, entity_id, roles: rolesArr },
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to update roles");
        return;
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

        <div className="flex flex-col gap-3 py-2">
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
