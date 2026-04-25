import { useState } from "react";
import { LogOut, Zap, ChevronDown, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ActionCentre } from "@/components/app-shell/ActionCentre";
import { useAuth } from "@/contexts/AuthContext";
import { useYear } from "@/contexts/YearContext";
import { useEntity } from "@/contexts/EntityContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import bonusbridgeIcon from "@/assets/bonusbridge-icon.png";
import type { Database } from "@/integrations/supabase/types";

type UserRole = Database["public"]["Enums"]["user_role"];

type TopNavProps = {
  notificationCount?: number;
};

const DEMO_ROLES: { role: UserRole; label: string; name: string }[] = [
  { role: "ceo",      label: "CEO",      name: "Sofia Andersen" },
  { role: "hr_rep",   label: "HR Rep",   name: "Marcus Webb"    },
  { role: "manager",  label: "Manager",  name: "Priya Nair"     },
  { role: "employee", label: "Employee", name: "Aisha Patel"    },
];

export function TopNav({ notificationCount = 0 }: TopNavProps) {
  const { person, roles, signOut, devPreviewSignIn } = useAuth();
  const { entity_name } = useEntity();
  const { selected_year, setSelectedYear } = useYear();
  const navigate = useNavigate();
  const [switchingTo, setSwitchingTo] = useState<UserRole | null>(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const initials = person
    ? `${person.first_name?.[0] ?? ""}${person.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  const currentRoleLabel =
    DEMO_ROLES.find((d) => roles.includes(d.role))?.label ?? roles[0] ?? "?";

  const handleDevSwitch = async (role: UserRole) => {
    if (switchingTo) return;
    setSwitchingTo(role);
    try {
      const { error } = await devPreviewSignIn(role);
      if (error) {
        toast.error(`Switch failed: ${error.message}. Has seed.sql been applied?`);
      } else {
        toast.success(`Switched to ${DEMO_ROLES.find((d) => d.role === role)?.name}`);
        navigate({ to: "/dashboard", replace: true });
      }
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <img src={bonusbridgeIcon} alt="BonusBridge" className="h-7 w-7 rounded-md" />
        <SidebarTrigger />
      </div>

      {/* Year selector — centred */}
      <div className="flex-1 flex justify-center">
        <Select
          value={String(selected_year)}
          onValueChange={(v) => setSelectedYear(Number(v))}
        >
          <SelectTrigger className="w-32 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {entity_name && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {entity_name}
          </span>
        )}

        {/* Dev role switcher — always visible; requires seed.sql data */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full border-dashed border-amber-500/60 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              disabled={!!switchingTo}
            >
              {switchingTo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{currentRoleLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Switch demo role
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DEMO_ROLES.map(({ role, label, name }) => {
              const isActive = roles.includes(role) && !roles.some(
                (r) => DEMO_ROLES.findIndex((d) => d.role === r) <
                        DEMO_ROLES.findIndex((d) => d.role === role)
              ) && roles[0] === role || roles.includes(role);
              return (
                <DropdownMenuItem
                  key={role}
                  onClick={() => handleDevSwitch(role)}
                  disabled={!!switchingTo}
                  className="flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{name}</span>
                  </div>
                  {switchingTo === role && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <ActionCentre />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {person ? `${person.first_name} ${person.last_name}` : "Account"}
                </span>
                {entity_name && (
                  <span className="text-xs text-muted-foreground">{entity_name}</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
