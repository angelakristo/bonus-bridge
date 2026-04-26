import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type BonusSchemeOption = {
  id: string;
  name: string;
};

export type AssignTarget = {
  person_id: string;
  full_name: string;
  current_scheme_id: string | null;
  midyear_eligible: boolean;
  yearend_eligible: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  year: number;
  schemes: BonusSchemeOption[];
  target: AssignTarget | null;
  onSaved: () => void;
};

export function AssignBonusModal({
  open,
  onOpenChange,
  entityId,
  year,
  schemes,
  target,
  onSaved,
}: Props) {
  const [schemeId, setSchemeId] = useState<string | null>(null);
  const [midyear, setMidyear] = useState(false);
  const [yearend, setYearend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && target) {
      setSchemeId(target.current_scheme_id);
      setMidyear(target.midyear_eligible);
      setYearend(target.yearend_eligible);
      setError(null);
    }
  }, [open, target]);

  const handleSave = async () => {
    if (!target) return;
    if (!schemeId) {
      setError("Please choose a bonus scheme.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data: existing, error: checkErr } = await supabase
      .from("employee_bonus_assignments")
      .select("id")
      .eq("person_id", target.person_id)
      .eq("year", year)
      .maybeSingle();

    if (checkErr) {
      console.error("[BonusAssign] check failed", checkErr);
      setError("Could not verify existing assignment.");
      setSaving(false);
      return;
    }

    if (existing) {
      const { error: upErr } = await supabase
        .from("employee_bonus_assignments")
        .update({
          bonus_scheme_id: schemeId,
          midyear_bonus_eligible: midyear,
          yearend_bonus_eligible: yearend,
        })
        .eq("id", existing.id);
      if (upErr) {
        console.error("[BonusAssign] update failed", upErr);
        setError("Failed to update bonus assignment.");
        setSaving(false);
        return;
      }
    } else {
      const { error: insErr } = await supabase
        .from("employee_bonus_assignments")
        .insert({
          entity_id: entityId,
          person_id: target.person_id,
          bonus_scheme_id: schemeId,
          year,
          midyear_bonus_eligible: midyear,
          yearend_bonus_eligible: yearend,
        });
      if (insErr) {
        console.error("[BonusAssign] insert failed", insErr);
        setError("Failed to assign bonus scheme.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(`Bonus scheme assigned to ${target.full_name}.`);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Bonus Scheme</DialogTitle>
          <DialogDescription>
            {target
              ? `Configure ${target.full_name}'s bonus eligibility for ${year}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bonus Scheme</Label>
            <Select
              value={schemeId ?? undefined}
              onValueChange={(v) => setSchemeId(v)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    schemes.length === 0
                      ? "No active schemes available"
                      : "Choose a scheme"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {schemes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="midyear-toggle">H1 Eligible</Label>
              <p className="text-xs text-muted-foreground">
                Eligible for H1 bonus payout.
              </p>
            </div>
            <Switch
              id="midyear-toggle"
              checked={midyear}
              onCheckedChange={setMidyear}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="yearend-toggle">Full Year Eligible</Label>
              <p className="text-xs text-muted-foreground">
                Eligible for full year bonus payout.
              </p>
            </div>
            <Switch
              id="yearend-toggle"
              checked={yearend}
              onCheckedChange={setYearend}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
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
            Save assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
