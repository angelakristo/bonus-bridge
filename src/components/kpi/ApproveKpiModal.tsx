import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

export type ApprovalAction = "approve" | "reject";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ApprovalAction;
  kpiTitle: string;
  employeeName: string;
  submitting?: boolean;
  onConfirm: (note: string) => void | Promise<void>;
};

export function ApproveKpiModal({
  open,
  onOpenChange,
  action,
  kpiTitle,
  employeeName,
  submitting = false,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  const isReject = action === "reject";
  const trimmed = note.trim();

  const handleConfirm = async () => {
    if (isReject && trimmed.length === 0) {
      setError("A rejection reason is required.");
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isReject ? "Reject KPI" : "Approve KPI"}</DialogTitle>
          <DialogDescription>
            {isReject
              ? `Reject "${kpiTitle}" for ${employeeName}? Please provide a reason below.`
              : `Approve "${kpiTitle}" for ${employeeName}? You can optionally leave a note.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="approval-note">
            {isReject ? "Rejection reason" : "Note (optional)"}
            {isReject && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Textarea
            id="approval-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isReject
                ? "Explain why this KPI is being rejected…"
                : "Add any context for the employee…"
            }
            rows={4}
            maxLength={1000}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant={isReject ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject ? "Reject" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
