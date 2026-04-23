# KPI & Bonus Management Platform

A web app for managing corporate, departmental, and individual KPIs along with bonus scheme design and assignment. Built for organizations that want to align performance measurement with reward structures.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) v1 (React 19 + Vite 7, SSR-capable)
- **Routing**: TanStack Router (file-based, type-safe)
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Backend**: Supabase (Postgres, Auth, RLS)
- **Deployment target**: Cloudflare Workers (edge)
- **Language**: TypeScript (strict)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (preferred) or Node.js 20+
- A Supabase project with the schema already provisioned (this repo does **not** manage migrations)

### Install

```bash
bun install
```

### Environment

Copy `.env` and provide your Supabase credentials:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### Run

```bash
bun run dev      # start dev server
bun run build    # production build
bun run preview  # preview production build
```

## Project Structure

```
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
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deeper walkthrough.

## Key Features

- **Setup Wizard** — Register entity, upload employees, assign roles, configure org/functional departments, set driver weightings.
- **KPI Board** — Define and view corporate, department, and individual KPIs across drivers (Growth, Efficiency, Culture).
- **Individual KPIs & Approvals** — Employees propose KPIs; managers/CEO approve.
- **Weighting Assignment** — Allocate group-level (Corporate/Department/Individual) and item-level KPI weights per employee, with sum-to-100 validation.
- **Bonus Scheme Builder** — CEO defines bonus schemes and tiered payout structures (Min %, Max %, Bonus % of Salary) with overlap validation.
- **Bonus Assignment** — CEO and managers assign schemes to employees with mid-year/year-end eligibility toggles.
- **Dashboard** — Aggregated KPI achievement and bonus projections.

## Roles

Stored in `people_roles` (separate from `people` to avoid privilege escalation):

| Role       | Capabilities |
|------------|--------------|
| `ceo`      | Full access — all setup, all KPIs, bonus schemes, all assignments. |
| `manager`  | Manages KPIs, weightings, and bonus assignments for their departments. |
| `hr_rep`   | HR-related setup tasks. |
| `employee` | Views own KPIs, proposes individual KPIs. |

## Database

The Supabase schema is **read-only from this codebase**. Do not modify tables, columns, or migrations from the app. Generated types live in `src/integrations/supabase/types.ts` and are regenerated against the live schema.

## Conventions

- **Design tokens only** — never hardcode colors; use semantic tokens from `src/styles.css`.
- **Routes** — file-based, dot-separated naming (e.g. `_authenticated.dashboard.tsx`).
- **Server functions** — must be Worker-compatible (no Node-only deps).
- **Forms & modals** — colocate by domain under `src/components/<domain>/`.
