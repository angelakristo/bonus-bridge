import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ExistingTier = {
  id: string;
  threshold_min_pct: number;
  threshold_max_pct: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemeId: string;
  existingTiers: ExistingTier[];
  onCreated: () => void;
};

// A tier covers [min, max] inclusive. A null max means "and above" (open-ended).
function rangesOverlap(
  aMin: number,
  aMax: number | null,
  bMin: number,
  bMax: number | null,
): boolean {
  const aHigh = aMax ?? Number.POSITIVE_INFINITY;
  const bHigh = bMax ?? Number.POSITIVE_INFINITY;
  return aMin <= bHigh && bMin <= aHigh;
}

export function AddBonusTierModal({
  open,
  onOpenChange,
  schemeId,
  existingTiers,
  onCreated,
}: Props) {
  const [minStr, setMinStr] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [bonusStr, setBonusStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMinStr("");
    setMaxStr("");
    setBonusStr("");
    setError(null);
  };

  const handleSave = async () => {
    setError(null);

    const min = parseFloat(minStr);
    const bonus = parseFloat(bonusStr);
    const max = maxStr.trim() === "" ? null : parseFloat(maxStr);

    if (!Number.isFinite(min)) {
      setError("Minimum Achievement % is required.");
      return;
    }
    if (!Number.isFinite(bonus)) {
      setError("Bonus % of Salary is required.");
      return;
    }
    if (max !== null && !Number.isFinite(max)) {
      setError("Maximum Achievement % must be a number or left blank.");
      return;
    }
    if (max !== null && max < min) {
      setError("Maximum must be greater than or equal to Minimum.");
      return;
    }

    const overlaps = existingTiers.some((t) =>
      rangesOverlap(min, max, t.threshold_min_pct, t.threshold_max_pct),
    );
    if (overlaps) {
      setError("This range overlaps with an existing tier. Adjust the values.");
      return;
    }

    setSaving(true);
    const { error: insertErr } = await supabase
      .from("bonus_scheme_tiers")
      .insert({
        bonus_scheme_id: schemeId,
        threshold_min_pct: min,
        threshold_max_pct: max,
        bonus_pct_of_salary: bonus,
      });
    setSaving(false);

    if (insertErr) {
      console.error("[BonusTier] insert failed", insertErr);
      setError("Failed to save tier.");
      return;
    }

    toast.success("Tier added.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Bonus Tier</DialogTitle>
          <DialogDescription>
            Define a payout tier. Leave Maximum blank for an open-ended "and
            above" tier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tier-min">
              Minimum Achievement %{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tier-min"
              type="number"
              step="0.01"
              value={minStr}
              onChange={(e) => setMinStr(e.target.value)}
              placeholder="e.g. 80"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tier-max">Maximum Achievement %</Label>
            <Input
              id="tier-max"
              type="number"
              step="0.01"
              value={maxStr}
              onChange={(e) => setMaxStr(e.target.value)}
              placeholder="Leave blank for 'and above'"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tier-bonus">
              Bonus % of Salary <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tier-bonus"
              type="number"
              step="0.01"
              value={bonusStr}
              onChange={(e) => setBonusStr(e.target.value)}
              placeholder="e.g. 10"
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
            Save tier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
