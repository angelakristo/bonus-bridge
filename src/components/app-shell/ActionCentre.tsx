import { useCallback, useEffect, useState } from "react";
import { Bell, Check, X, ClipboardCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type ManagerItem = {
  individual_kpi_id: string;
  person_id: string;
  employee_name: string;
  kpi_title: string;
};

type EmployeeItem = {
  individual_kpi_id: string;
  kpi_title: string;
  status: "approved" | "rejected";
};

export function ActionCentre() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const { selected_year } = useYear();
  const navigate = useNavigate();

  const isManagerRole = roles.some((r) => r === "ceo" || r === "manager");
  const isEmployeeRole = roles.some((r) => r === "employee");
  const isCeo = roles.some((r) => r === "ceo");

  const [managerItems, setManagerItems] = useState<ManagerItem[]>([]);
  const [employeeItems, setEmployeeItems] = useState<EmployeeItem[]>([]);
  const [open, setOpen] = useState(false);

  const loadManager = useCallback(async () => {
    if (!entity_id || !person?.id) return;

    // Determine which person_ids this user can review.
    // CEO: all people in the entity.
    // Manager: people who share at least one org_department with the manager.
    let personIds: string[] | null = null;

    if (!isCeo) {
      const { data: myDepts } = await supabase
        .from("people_org_departments")
        .select("org_department_id")
        .eq("person_id", person.id);
      const deptIds = (myDepts ?? []).map((d) => d.org_department_id);
      if (deptIds.length === 0) {
        setManagerItems([]);
        return;
      }
      const { data: peers } = await supabase
        .from("people_org_departments")
        .select("person_id")
        .in("org_department_id", deptIds);
      personIds = Array.from(new Set((peers ?? []).map((p) => p.person_id))).filter(
        (id) => id !== person.id,
      );
      if (personIds.length === 0) {
        setManagerItems([]);
        return;
      }
    }

    let query = supabase
      .from("individual_kpis")
      .select(
        "id, person_id, kpi_definitions(title), people:person_id(first_name, last_name)",
      )
      .eq("entity_id", entity_id)
      .eq("year", selected_year)
      .eq("status", "pending_approval");

    if (personIds) query = query.in("person_id", personIds);

    const { data, error } = await query;
    if (error) {
      console.error("[ActionCentre] manager query failed", error);
      setManagerItems([]);
      return;
    }

    const items: ManagerItem[] = (data ?? []).map((r) => {
      const def = r.kpi_definitions as unknown as { title: string } | null;
      const p = r.people as unknown as { first_name: string; last_name: string } | null;
      return {
        individual_kpi_id: r.id,
        person_id: r.person_id ?? "",
        employee_name: p ? `${p.first_name} ${p.last_name}` : "Unknown",
        kpi_title: def?.title ?? "Untitled KPI",
      };
    });
    setManagerItems(items);
  }, [entity_id, person?.id, selected_year, isCeo]);

  const loadEmployee = useCallback(async () => {
    if (!entity_id || !person?.id) return;
    const { data, error } = await supabase
      .from("individual_kpis")
      .select("id, status, kpi_definitions(title)")
      .eq("entity_id", entity_id)
      .eq("person_id", person.id)
      .eq("year", selected_year)
      .in("status", ["approved", "rejected"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("[ActionCentre] employee query failed", error);
      setEmployeeItems([]);
      return;
    }
    const items: EmployeeItem[] = (data ?? []).map((r) => {
      const def = r.kpi_definitions as unknown as { title: string } | null;
      return {
        individual_kpi_id: r.id,
        status: r.status as "approved" | "rejected",
        kpi_title: def?.title ?? "Untitled KPI",
      };
    });
    setEmployeeItems(items);
  }, [entity_id, person?.id, selected_year]);

  useEffect(() => {
    if (isManagerRole) void loadManager();
    if (isEmployeeRole) void loadEmployee();
  }, [isManagerRole, isEmployeeRole, loadManager, loadEmployee]);

  const items = isManagerRole ? managerItems : employeeItems;
  const count = items.length;

  const handleReview = (personId: string) => {
    setOpen(false);
    navigate({ to: "/kpi-approvals", search: { person_id: personId } as never });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Action centre"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
            >
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Action Centre</p>
          <p className="text-xs text-muted-foreground">
            {isManagerRole
              ? `${count} KPI${count === 1 ? "" : "s"} pending your approval`
              : `${count} recent KPI decision${count === 1 ? "" : "s"}`}
          </p>
        </div>

        <ScrollArea className="max-h-80">
          {count === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing to review right now.
            </p>
          ) : isManagerRole ? (
            <ul className="divide-y">
              {managerItems.map((item) => (
                <li key={item.individual_kpi_id} className="flex items-start gap-3 p-3">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.employee_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.kpi_title}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleReview(item.person_id)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y">
              {employeeItems.map((item) => (
                <li key={item.individual_kpi_id} className="flex items-start gap-3 p-3">
                  {item.status === "approved" ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.kpi_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.status === "approved" ? "Approved" : "Rejected"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
