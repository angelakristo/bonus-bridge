import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Target,
  Wallet,
  Settings,
  Upload,
  Scale,
  CheckSquare,
  History,
  ChevronDown,
  UserPlus,
  PlusCircle,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import type { Database } from "@/integrations/supabase/types";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AddEmployeeManuallyModal } from "@/components/employee-upload/AddEmployeeManuallyModal";
import { AddKpiModal } from "@/components/kpi/AddKpiModal";

type UserRole = Database["public"]["Enums"]["user_role"];

// Flat nav items for non-CEO roles
type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: UserRole[];
};

const FLAT_NAV_ITEMS: NavItem[] = [
  { title: "My Dashboard",      url: "/dashboard",            icon: Home,        roles: ["ceo", "manager", "hr_rep", "employee"] },
  { title: "KPI Board",         url: "/kpi-board",            icon: Target,      roles: ["manager"] },
  { title: "KPI Approvals",     url: "/kpi-approvals",        icon: CheckSquare, roles: ["manager"] },
  { title: "My KPI Proposals",  url: "/individual-kpis",      icon: Target,      roles: ["employee"] },
  { title: "Weightings",        url: "/weighting-assignment",  icon: Scale,       roles: ["manager"] },
  { title: "Bonus Assignments", url: "/bonus-assignments",    icon: Wallet,      roles: ["manager"] },
  { title: "Setup",             url: "/setup",                icon: Settings,    roles: ["hr_rep"] },
  { title: "Upload Employees",  url: "/employee-upload",      icon: Upload,      roles: ["hr_rep"] },
  { title: "Upload Actuals",    url: "/actuals-upload",       icon: Upload,      roles: ["hr_rep"] },
  { title: "Upload History",    url: "/upload-history",       icon: History,     roles: ["hr_rep"] },
];

// CEO grouped nav structure
type NavGroup = {
  title: string;
  icon: LucideIcon;
  items: { title: string; url: string }[];
};

const CEO_GROUPS: NavGroup[] = [
  {
    title: "KPIs",
    icon: Target,
    items: [
      { title: "KPI Board",       url: "/kpi-board" },
      { title: "KPI Approvals",   url: "/kpi-approvals" },
      { title: "KPI Proposals",   url: "/individual-kpis" },
      { title: "Weightings",      url: "/weighting-assignment" },
    ],
  },
  {
    title: "Bonuses",
    icon: Wallet,
    items: [
      { title: "Bonus Schemes",     url: "/bonus-schemes" },
      { title: "Bonus Assignments", url: "/bonus-assignments" },
    ],
  },
  {
    title: "Uploads",
    icon: Upload,
    items: [
      { title: "Upload Employees", url: "/employee-upload" },
      { title: "Upload Actuals",   url: "/actuals-upload" },
      { title: "Upload History",   url: "/upload-history" },
    ],
  },
];

function hasAnyRole(userRoles: UserRole[], allowed: UserRole[]) {
  return userRoles.some((r) => allowed.includes(r));
}

export function AppSidebar() {
  const { roles, person } = useAuth();
  const { entity_id } = useEntity();
  const location = useLocation();

  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [addKpiOpen, setAddKpiOpen] = useState(false);

  const isCeo = roles.includes("ceo");
  const isHrRep = roles.includes("hr_rep");
  const showActionButtons = isCeo || isHrRep;

  // For CEO, track which groups are open (default all open)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    KPIs: true,
    Bonuses: true,
    Uploads: true,
  });

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const isActive = (url: string) => location.pathname === url;

  const groupIsActive = (group: NavGroup) =>
    group.items.some((item) => isActive(item.url));

  return (
    <>
      <Sidebar collapsible="icon">
        {showActionButtons && (
          <SidebarHeader className="border-b p-3 gap-2 group-data-[collapsible=icon]:hidden">
            <Button
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => setAddEmployeeOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Add Team Member</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => setAddKpiOpen(true)}
            >
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Add KPI</span>
            </Button>
          </SidebarHeader>
        )}

        <SidebarContent>
          {isCeo ? (
            // CEO: My Dashboard (flat) + grouped sections + Setup (flat)
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* My Dashboard */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/dashboard")} tooltip="My Dashboard">
                      <Link to="/dashboard">
                        <Home className="h-4 w-4" />
                        <span>My Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Collapsible groups */}
                  {CEO_GROUPS.map((group) => (
                    <Collapsible
                      key={group.title}
                      open={openGroups[group.title]}
                      onOpenChange={() => toggleGroup(group.title)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={group.title}
                            isActive={!openGroups[group.title] && groupIsActive(group)}
                          >
                            <group.icon className="h-4 w-4" />
                            <span>{group.title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {group.items.map((item) => (
                              <SidebarMenuSubItem key={item.url}>
                                <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                                  <Link to={item.url}>{item.title}</Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ))}

                  {/* Setup */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/setup")} tooltip="Setup">
                      <Link to="/setup">
                        <Settings className="h-4 w-4" />
                        <span>Setup</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            // Non-CEO: flat nav filtered by role
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {FLAT_NAV_ITEMS.filter((item) => hasAnyRole(roles, item.roles)).map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
      </Sidebar>

      {/* Modals */}
      {showActionButtons && entity_id && person?.id && (
        <>
          <AddEmployeeManuallyModal
            open={addEmployeeOpen}
            onOpenChange={setAddEmployeeOpen}
            entityId={entity_id}
            uploaderPersonId={person.id}
            onCreated={() => setAddEmployeeOpen(false)}
          />
          <AddKpiModal
            open={addKpiOpen}
            onOpenChange={setAddKpiOpen}
            onSuccess={() => setAddKpiOpen(false)}
          />
        </>
      )}
    </>
  );
}
