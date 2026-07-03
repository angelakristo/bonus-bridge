import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2, Plus, ChevronRight, X, GripVertical, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

import { supabase } from "@/integrations/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_setupLayout/org-departments")({
  component: DepartmentSetupPage,
});

type Department = {
  id: string;
  name: string;
  parent_id: string | null;
};

type FuncDept = {
  id: string;
  name: string;
};

const NONE_VALUE = "__none__";
const PALETTE_ID = "palette";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Department name is required")
  .max(200, "Max 200 characters");

function DepartmentSetupPage() {
  const { entity_id } = useEntity();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [funcDepts, setFuncDepts] = useState<FuncDept[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [activeFdId, setActiveFdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proceeding, setProceeding] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
    const incoming = data ?? [];
    setDepartments(incoming);
    const deptIds = new Set(incoming.map((d) => d.id));
    setAssignments((prev) => {
      const next: Record<string, string[]> = {};
      for (const [key, val] of Object.entries(prev)) {
        if (deptIds.has(key)) next[key] = val;
      }
      return next;
    });
  };

  useEffect(() => {
    fetchDepartments();
  }, [entity_id]);

  useEffect(() => {
    supabase
      .from("functions")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("[DeptSetup] failed to load functional depts", error);
          return;
        }
        setFuncDepts(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!entity_id) return;
    const stored = localStorage.getItem(`bb_dept_setup_${entity_id}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { assignments?: Record<string, string[]> };
        if (parsed.assignments) setAssignments(parsed.assignments);
      } catch {
        // ignore malformed data
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity_id]);

  useEffect(() => {
    if (!entity_id) return;
    localStorage.setItem(`bb_dept_setup_${entity_id}`, JSON.stringify({ assignments }));
  }, [entity_id, assignments]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveFdId((event.active.id as string).replace("fd_", ""));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFdId(null);
    if (!over) return;

    const fdId = (active.id as string).replace("fd_", "");
    const target = over.id as string;

    if (target === PALETTE_ID) return; // dropping back on palette is a no-op

    const targetDeptId = target.replace("od_", "");
    setAssignments((prev) => {
      const current = prev[targetDeptId] ?? [];
      if (current.includes(fdId)) return prev; // already assigned to this dept
      return { ...prev, [targetDeptId]: [...current, fdId] };
    });
  };

  const handleUnassign = (deptId: string, fdId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [deptId]: (prev[deptId] ?? []).filter((id) => id !== fdId),
    }));
  };

  const handleProceed = async () => {
    if (!entity_id) return;
    setProceeding(true);
    try {
      const { error } = await supabase.from("setup_progress").upsert(
        {
          entity_id,
          step_key: "build_org_departments",
          status: "complete",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_id,step_key" },
      );
      if (error) throw error;
      navigate({ to: "/team-setup" });
    } catch {
      toast.error("Failed to proceed. Please try again.");
    } finally {
      setProceeding(false);
    }
  };

  const activeFd = activeFdId ? funcDepts.find((fd) => fd.id === activeFdId) : null;

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to view this page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Department Setup</h1>
          <p className="text-sm text-muted-foreground">
            Build your org structure, then drag functional areas onto each department.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!entity_id}>
          <Plus /> Add Department
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Org Department Tree */}
          <div className="lg:col-span-2">
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
                  <OrgDeptTree
                    departments={departments}
                    assignments={assignments}
                    funcDepts={funcDepts}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                    onUnassign={handleUnassign}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Functional Departments Palette */}
          <div>
            <Card className="sticky top-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Functions</CardTitle>
                <CardDescription className="text-xs">
                  Drag onto a department — a function can belong to multiple departments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PaletteDrop>
                  {funcDepts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {funcDepts.map((fd) => (
                        <DraggableFdChip key={fd.id} fd={fd} />
                      ))}
                    </div>
                  )}
                </PaletteDrop>
              </CardContent>
            </Card>
          </div>
        </div>

        <DragOverlay>
          {activeFd ? (
            <div className="flex cursor-grabbing items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
              <GripVertical className="h-3 w-3" />
              {activeFd.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Proceed Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleProceed} disabled={proceeding || !entity_id}>
          {proceeding ? "Saving..." : "Proceed to Team Setup"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

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

function PaletteDrop({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: PALETTE_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-12 rounded-md p-1 transition-colors",
        isOver && "bg-accent/40 ring-1 ring-border",
      )}
    >
      {children}
    </div>
  );
}

function DraggableFdChip({ fd }: { fd: FuncDept }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `fd_${fd.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium transition-all",
        "hover:border-primary/60 hover:text-primary",
        isDragging && "opacity-30",
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {fd.name}
    </div>
  );
}

function OrgDeptTree({
  departments,
  assignments,
  funcDepts,
  onEdit,
  onDelete,
  onUnassign,
}: {
  departments: Department[];
  assignments: Record<string, string[]>;
  funcDepts: FuncDept[];
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
  onUnassign: (deptId: string, fdId: string) => void;
}) {
  const fdById = new Map(funcDepts.map((fd) => [fd.id, fd]));

  const childrenOf = (parentId: string | null) =>
    departments.filter((d) => d.parent_id === parentId);

  const renderNode = (d: Department, depth: number): React.ReactNode => {
    const kids = childrenOf(d.id);
    const assignedFds = (assignments[d.id] ?? [])
      .map((id) => fdById.get(id))
      .filter(Boolean) as FuncDept[];

    return (
      <div key={d.id}>
        <DroppableOrgRow
          dept={d}
          depth={depth}
          assignedFds={assignedFds}
          onEdit={onEdit}
          onDelete={onDelete}
          onUnassign={onUnassign}
        />
        {kids.length > 0 && (
          <div className="mt-1 space-y-1">{kids.map((k) => renderNode(k, depth + 1))}</div>
        )}
      </div>
    );
  };

  const roots = childrenOf(null);
  return <div className="space-y-1">{roots.map((d) => renderNode(d, 0))}</div>;
}

function DroppableOrgRow({
  dept,
  depth,
  assignedFds,
  onEdit,
  onDelete,
  onUnassign,
}: {
  dept: Department;
  depth: number;
  assignedFds: FuncDept[];
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
  onUnassign: (deptId: string, fdId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `od_${dept.id}` });

  return (
    <div
      ref={setNodeRef}
      style={{ marginLeft: depth * 24 }}
      className={cn(
        "rounded-md border border-border/60 bg-card p-3 transition-colors",
        isOver ? "border-primary bg-primary/5" : "hover:bg-accent/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {depth > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="font-medium">{dept.name}</span>
          </div>

          {assignedFds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {assignedFds.map((fd) => (
                <span
                  key={fd.id}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {fd.name}
                  <button
                    onClick={() => onUnassign(dept.id, fd.id)}
                    className="ml-0.5 rounded-full hover:text-destructive"
                    aria-label={`Remove ${fd.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p
              className={cn(
                "text-[11px] italic",
                isOver ? "text-primary" : "text-muted-foreground/60",
              )}
            >
              {isOver ? "Drop here to assign" : "Drag a function here"}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(dept)}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(dept)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
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
              {mode === "add" ? "Add Department" : "Edit Department"}
            </DialogTitle>
            <DialogDescription>
              {mode === "add"
                ? "Create a new department in your organisation."
                : "Update this department's name or parent."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
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
  const [checking, setChecking] = useState(false);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!target) {
      setAssignedCount(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    supabase
      .from("people_org_departments")
      .select("person_id", { count: "exact", head: true })
      .eq("org_department_id", target.id)
      .then(({ count, error }) => {
        if (cancelled) return;
        setChecking(false);
        if (error) {
          toast.error(error.message);
          setAssignedCount(0);
          return;
        }
        setAssignedCount(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const hasAssignedPeople = (assignedCount ?? 0) > 0;

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
            {checking
              ? "Checking assignments..."
              : hasAssignedPeople
                ? "This department has people assigned to it. Reassign them before deleting."
                : "This action cannot be undone. Child departments will become orphaned and may need to be reassigned."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={submitting || checking || hasAssignedPeople}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
