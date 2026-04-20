import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type UserRole = "ceo" | "manager" | "hr_rep" | "employee";

const ROLE_STYLES: Record<UserRole, string> = {
  ceo: "bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200",
  manager: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200",
  hr_rep: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
  employee: "bg-slate-100 text-slate-800 hover:bg-slate-100 border-slate-200",
};

const ROLE_LABEL: Record<UserRole, string> = {
  ceo: "CEO",
  manager: "Manager",
  hr_rep: "HR Rep",
  employee: "Employee",
};

export function RoleChip({ role }: { role: UserRole }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ROLE_STYLES[role])}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}
