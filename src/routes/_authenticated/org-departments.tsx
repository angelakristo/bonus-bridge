import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/org-departments")({
  component: OrgDepartmentBuilderPage,
});

type Department = {
  id: string;
  name: string;
  parent_id: string | null;
};

const NONE_VALUE = "__none__";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Department name is required")
  .max(200, "Max 200 characters");

function OrgDepartmentBuilderPage() {
  const { entity_id } = useEntity();
  const { roles } = useAuth();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const fetchDepartments = async () => {
    if (!entity_id) {
      setDepartments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("organisational_departments")
      .select("id, name, parent_id")
      .eq("entity_id", entity_id)
      .order("name", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDepartments(data ?? []);
  };

  useEffect(() => {
    fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity_id]);

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Org Department Builder</h1>
          <p className="text-sm text-muted-foreground">
            Organise your company's reporting structure.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!entity_id}>
          <Plus /> Add Department
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organisational Tree</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments yet. Click "Add Department" to start.
            </p>
          ) : (
            <DepartmentTree
              departments={departments}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          )}
        </CardContent>
      </Card>

      <AddOrEditModal
        open={addOpen || !!editing}
        mode={editing ? "edit" : "add"}
        existing={editing}
        departments={departments}
        entityId={entity_id}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={fetchDepartments}
      />

      <DeleteDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={fetchDepartments}
      />
    </div>
  );
}

function DepartmentTree({
  departments,
  onEdit,
  onDelete,
}: {
  departments: Department[];
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
}) {
  const childrenOf = (parentId: string | null) =>
    departments.filter((d) => d.parent_id === parentId);

  const renderNode = (d: Department, depth: number) => {
    const kids = childrenOf(d.id);
    return (
      <div key={d.id}>
        <div
          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card p-3 transition-colors hover:bg-accent/30"
          style={{ marginLeft: depth * 24 }}
        >
          <div className="flex items-center gap-2">
            {depth > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium">{d.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(d)}>
              <Pencil /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(d)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
        {kids.length > 0 && (
          <div className="mt-2 space-y-2">{kids.map((k) => renderNode(k, depth + 1))}</div>
        )}
      </div>
    );
  };

  const roots = childrenOf(null);
  return <div className="space-y-2">{roots.map((d) => renderNode(d, 0))}</div>;
}

function AddOrEditModal({
  open,
  mode,
  existing,
  departments,
  entityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "add" | "edit";
  existing: Department | null;
  departments: Department[];
  entityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(NONE_VALUE);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setParentId(existing?.parent_id ?? NONE_VALUE);
    }
  }, [open, existing]);

  // Prevent setting self or a descendant as parent when editing
  const invalidParentIds = new Set<string>();
  if (existing) {
    invalidParentIds.add(existing.id);
    const collect = (id: string) => {
      departments
        .filter((d) => d.parent_id === id)
        .forEach((d) => {
          invalidParentIds.add(d.id);
          collect(d.id);
        });
    };
    collect(existing.id);
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!entityId) {
      toast.error("No entity selected");
      return;
    }
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    const parent = parentId === NONE_VALUE ? null : parentId;

    setSubmitting(true);
    if (mode === "add") {
      const { error } = await supabase
        .from("organisational_departments")
        .insert({ entity_id: entityId, name: parsed.data, parent_id: parent });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Department added");
    } else if (existing) {
      const { error } = await supabase
        .from("organisational_departments")
        .update({ name: parsed.data, parent_id: parent })
        .eq("id", existing.id);
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Department updated");
    }

    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "add" ? "Add Org Department" : "Edit Department"}
            </DialogTitle>
            <DialogDescription>
              {mode === "add"
                ? "Create a new department in your organisation."
                : "Update this department's name or parent."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Department Name</Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="e.g. Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept-parent">Parent Department</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="dept-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None — top level</SelectItem>
                  {departments
                    .filter((d) => !invalidParentIds.has(d.id))
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : mode === "add" ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: Department | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (!target) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("organisational_departments")
      .delete()
      .eq("id", target.id);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Department deleted");
    onDeleted();
    onClose();
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{target?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Child departments will become orphaned and may need to be
            reassigned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
