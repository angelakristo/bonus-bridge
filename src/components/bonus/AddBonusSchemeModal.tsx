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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EditingScheme = { id: string; name: string; description: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  editing?: EditingScheme;
  onCreated: () => void;
  onUpdated?: () => void;
};

export function AddBonusSchemeModal({
  open,
  onOpenChange,
  entityId,
  editing,
  onCreated,
  onUpdated,
}: Props) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setError(null);
    }
  }, [open, editing]);

  const reset = () => {
    setName("");
    setDescription("");
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Scheme Name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const nameChanged = !editing || trimmed.toLowerCase() !== editing.name.toLowerCase();
    if (nameChanged) {
      const { data: existing, error: checkErr } = await supabase
        .from("bonus_schemes")
        .select("id")
        .eq("entity_id", entityId)
        .ilike("name", trimmed)
        .maybeSingle();

      if (checkErr) {
        console.error("[BonusScheme] uniqueness check failed", checkErr);
        setError("Could not verify scheme name. Please try again.");
        setSaving(false);
        return;
      }

      if (existing) {
        setError("A bonus scheme with this name already exists.");
        setSaving(false);
        return;
      }
    }

    if (editing) {
      const { error: updateErr } = await supabase
        .from("bonus_schemes")
        .update({
          name: trimmed,
          description: description.trim() || null,
        })
        .eq("id", editing.id);

      setSaving(false);

      if (updateErr) {
        console.error("[BonusScheme] update failed", updateErr);
        setError("Failed to update bonus scheme.");
        return;
      }

      toast.success(`Bonus scheme "${trimmed}" updated.`);
      onOpenChange(false);
      onUpdated?.();
    } else {
      const { error: insertErr } = await supabase.from("bonus_schemes").insert({
        entity_id: entityId,
        name: trimmed,
        description: description.trim() ? description.trim() : null,
        is_active: true,
      });

      setSaving(false);

      if (insertErr) {
        console.error("[BonusScheme] insert failed", insertErr);
        setError("Failed to create bonus scheme.");
        return;
      }

      toast.success(`Bonus scheme "${trimmed}" created.`);
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !editing) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Bonus Scheme" : "Add Bonus Scheme"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the name and description of this bonus scheme."
              : "Create a new bonus scheme for your organisation."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scheme-name">
              Scheme Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="scheme-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Leadership Annual Bonus"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scheme-description">Description</Label>
            <Textarea
              id="scheme-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this scheme"
              rows={4}
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
            {editing ? "Save changes" : "Save scheme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
