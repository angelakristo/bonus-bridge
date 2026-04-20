export type SetupStep = {
  key: string;
  title: string;
  description: string;
  route?: string;
};

export const STEPS: SetupStep[] = [
  {
    key: "register_entity",
    title: "Register Entity",
    description: "Set your organisation name and basic details.",
    route: "/register-entity",
  },
  {
    key: "build_org_departments",
    title: "Build Org Departments",
    description: "Create your organisational department hierarchy.",
    route: "/org-departments",
  },
  {
    key: "upload_employees",
    title: "Upload Employees",
    description: "Import your employee list from a spreadsheet.",
    route: "/employee-upload",
  },
  {
    key: "assign_roles",
    title: "Assign Roles",
    description: "Give each person their CEO, manager, HR or employee role.",
    route: "/role-assignment",
  },
  {
    key: "set_driver_weightings",
    title: "Set Driver Weightings",
    description: "Allocate % weight to Growth, Efficiency and Culture.",
  },
  {
    key: "configure_corporate_kpis",
    title: "Configure Corporate KPIs",
    description: "Define the KPIs that apply company-wide.",
  },
  {
    key: "configure_department_kpis",
    title: "Configure Department KPIs",
    description: "Define KPIs for each department.",
  },
  {
    key: "employee_kpi_proposals",
    title: "Employee KPI Proposals",
    description: "Review and approve individual KPI proposals.",
  },
  {
    key: "assign_weightings",
    title: "Assign Weightings",
    description: "Set how corporate / department / individual KPIs weigh per employee.",
  },
  {
    key: "assign_bonus_schemes",
    title: "Assign Bonus Schemes",
    description: "Link each employee to a bonus scheme and tier.",
  },
];
