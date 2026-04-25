import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { EmployeeDashboard } from "@/components/dashboard/EmployeeDashboard";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";
import { CeoDashboard } from "@/components/dashboard/CeoDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { roles } = useAuth();

  if (roles.includes("ceo")) return <CeoDashboard />;
  if (roles.includes("manager")) return <ManagerDashboard />;
  return <EmployeeDashboard />;
}
