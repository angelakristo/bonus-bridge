import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Users,
  UserCircle,
  Target,
  Wallet,
  Settings,
  Upload,
  Scale,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type UserRole = Database["public"]["Enums"]["user_role"];

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { title: "My Dashboard", url: "/dashboard", icon: Home, roles: ["ceo", "manager", "hr_rep", "employee"] },
  { title: "Department View", url: "/departments", icon: Users, roles: ["ceo", "manager"] },
  { title: "Employee View", url: "/employees", icon: UserCircle, roles: ["ceo", "manager"] },
  { title: "KPI Board", url: "/kpi-board", icon: Target, roles: ["ceo", "manager"] },
  { title: "Weightings", url: "/weighting-assignment", icon: Scale, roles: ["ceo", "manager"] },
  { title: "My KPI Proposals", url: "/individual-kpis", icon: Target, roles: ["employee"] },
  { title: "Bonus Schemes", url: "/bonus-schemes", icon: Wallet, roles: ["ceo"] },
  { title: "Bonus Assignments", url: "/bonus-assignments", icon: Wallet, roles: ["ceo", "manager"] },
  { title: "Setup", url: "/setup", icon: Settings, roles: ["ceo", "hr_rep"] },
  { title: "Upload Data", url: "/employee-upload", icon: Upload, roles: ["ceo", "hr_rep"] },
];

function hasAnyRole(userRoles: UserRole[], allowed: UserRole[]) {
  return userRoles.some((r) => allowed.includes(r));
}

export function AppSidebar() {
  const { roles } = useAuth();
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => hasAnyRole(roles, item.roles));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
