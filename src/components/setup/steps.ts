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
    title: "Department Setup",
    description: "Build your org structure and assign functional areas.",
    route: "/org-departments",
  },
  {
    key: "team_setup",
    title: "Team Setup",
    description: "Add employees, assign roles and functions.",
    route: "/team-setup",
  },
  {
    key: "kpi_setup",
    title: "KPI Setup",
    description: "Set driver weightings and configure corporate and department KPIs.",
    route: "/kpi-setup",
  },
  {
    key: "assign_bonus_schemes",
    title: "Bonus Setup",
    description: "Link each employee to a bonus scheme and tier.",
    route: "/bonus-setup",
  },
];
