# KPI & Bonus Management Platform

A web application for managing corporate, departmental, and individual KPIs alongside bonus scheme design and assignment. Built for organizations that want to align performance measurement with reward structures.

Built collaboratively as a team project for **Tessa Group**.

## Overview

The platform lets companies define KPIs across three levels (corporate, department, and individual), link them to structured bonus schemes, and manage the full approval and assignment workflow through a single interface. Role-based access ensures each user — from CEO to employee — sees only what is relevant to their responsibilities.

## Tech Stack

- **Framework:** TanStack Start v1 (React 19 + Vite 7, SSR-capable)
- **Routing:** TanStack Router (file-based, type-safe)
- **Styling:** Tailwind CSS v4 + shadcn/ui components
- **Backend:** Supabase (PostgreSQL, Authentication, Row-Level Security)
- **Deployment target:** Cloudflare Workers (edge)
- **Language:** TypeScript (strict)

## Key Features

- **Setup Wizard** — Register entity, upload employees, assign roles, configure organizational and functional departments, and set driver weightings.
- **KPI Board** — Define and view corporate, department, and individual KPIs across drivers (Growth, Efficiency, Culture).
- **Individual KPIs & Approvals** — Employees propose KPIs; managers and CEO approve them through a structured workflow.
- **Weighting Assignment** — Allocate group-level (Corporate / Department / Individual) and item-level KPI weights per employee, with sum-to-100 validation.
- **Bonus Scheme Builder** — CEO defines bonus schemes and tiered payout structures (Min %, Max %, Bonus % of Salary) with overlap validation.
- **Bonus Assignment** — CEO and managers assign schemes to employees with mid-year and year-end eligibility toggles.
- **Dashboard** — Aggregated KPI achievement metrics and bonus projections.

## Roles

Roles are stored in `people_roles` (kept separate from `people` to avoid privilege escalation):

| Role | Capabilities |
|------|--------------|
| `ceo` | Full access — all setup, all KPIs, all bonus schemes, all assignments. |
| `manager` | Manages KPIs, weightings, and bonus assignments for their departments. |
| `hr_rep` | HR-related setup tasks. |
| `employee` | Views own KPIs and proposes individual KPIs. |

## Getting Started

### Prerequisites

- Bun (preferred) or Node.js 20+
- A Supabase project with the schema already provisioned (this repository does not manage migrations)

### Installation

​```bash
bun install
​```

### Environment

Copy `.env` and provide your Supabase credentials:

​```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
​```

### Running

​```bash
bun run dev      # start dev server
bun run build    # production build
bun run preview  # preview production build
​```

## Project Structure

​```
src/
├── routes/                  # File-based routes (TanStack Router)
│   ├── __root.tsx           # Root layout shell
│   ├── _authenticated/      # Auth-gated routes
│   │   └── _setupLayout/    # Setup wizard sub-layout
│   └── login.tsx
├── components/
│   ├── app-shell/           # Sidebar, top nav, action centre
│   ├── bonus/               # Bonus scheme & assignment modals
│   ├── kpi/                 # KPI cards & approval modals
│   ├── role-assignment/     # Role editor
│   ├── employee-upload/     # Employee CSV upload + manual add
│   ├── setup/               # Setup checklist
│   └── ui/                  # shadcn/ui primitives
├── contexts/                # Auth, Entity, Year contexts
├── integrations/supabase/   # Supabase client + helper functions
├── hooks/
├── lib/
└── styles.css               # Design tokens (oklch) + Tailwind layer
​```

For a deeper walkthrough of the architecture, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Database

The Supabase schema is read-only from this codebase — tables, columns, and migrations are not modified from the app. Generated types live in `src/integrations/supabase/types.ts` and are regenerated against the live schema.

## Conventions

- **Design tokens only** — never hardcode colors; use semantic tokens from `src/styles.css`.
- **Routes** — file-based, dot-separated naming (e.g. `_authenticated.dashboard.tsx`).
- **Server functions** — must be Worker-compatible (no Node-only dependencies).
- **Forms and modals** — colocated by domain under `src/components/<domain>/`.
