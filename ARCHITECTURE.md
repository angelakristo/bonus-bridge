# Architecture

This document describes the structure, data flow, and key design decisions of the KPI & Bonus Management platform.

## High-Level Overview

```
┌──────────────┐    ┌──────────────────┐    ┌────────────────┐
│   Browser    │ ── │ TanStack Start   │ ── │   Supabase     │
│  (React 19)  │    │  (Vite + SSR)    │    │ (Postgres+Auth)│
└──────────────┘    └──────────────────┘    └────────────────┘
                            │
                    Cloudflare Workers
                    (edge runtime)
```

- The client is a React 19 SPA hydrated by TanStack Start's SSR.
- Auth, data, and RLS are enforced by Supabase.
- Server functions (where used) run on Cloudflare Workers with `nodejs_compat`.

## Routing

File-based routing via TanStack Router. Routes live in `src/routes/`:

```
__root.tsx                              → app shell, providers
index.tsx                               → / (redirects based on auth)
login.tsx                               → /login
_authenticated.tsx                      → auth gate (layout)
  ├── dashboard.tsx                     → /dashboard
  ├── kpi-board.tsx                     → /kpi-board
  ├── individual-kpis.tsx               → /individual-kpis
  ├── kpi-approvals.tsx                 → /kpi-approvals
  ├── weighting-assignment.tsx          → /weighting-assignment
  ├── bonus-schemes.tsx                 → /bonus-schemes
  ├── bonus-assignments.tsx             → /bonus-assignments
  ├── setup.tsx                         → /setup
  └── _setupLayout/                     → setup wizard sub-layout
        ├── register-entity.tsx
        ├── employee-upload.tsx
        ├── role-assignment.tsx
        ├── org-departments.tsx
        └── driver-weightings.tsx
```

`_authenticated.tsx` enforces a session and loads the user's `people` record, roles, and entity into context. `_setupLayout` provides the setup-wizard chrome (progress checklist).

## Providers & Context

Established in `__root.tsx` and `_authenticated.tsx`:

- **AuthContext** (`src/contexts/AuthContext.tsx`) — Supabase session, current `person`, `roles[]`.
- **EntityContext** (`src/contexts/EntityContext.tsx`) — current `entity_id` (multi-tenant scope).
- **YearContext** (`src/contexts/YearContext.tsx`) — selected year for KPI / bonus operations.

All three are used pervasively for scoping queries.

## Role-Based Access

Roles are stored in `people_roles` (separate table — never on `people`) and exposed via `useAuth().roles`. Pages gate on roles client-side **and** rely on Supabase RLS for enforcement:

| Route                     | Allowed roles            |
|---------------------------|--------------------------|
| `/setup/*`                | `ceo`, `hr_rep`          |
| `/kpi-board`              | all authenticated        |
| `/individual-kpis`        | all (scoped to self)     |
| `/kpi-approvals`          | `ceo`, `manager`         |
| `/weighting-assignment`   | `ceo`, `manager`         |
| `/bonus-schemes`          | `ceo`                    |
| `/bonus-assignments`      | `ceo`, `manager`         |

Non-permitted users see an "Access denied" card.

## Data Layer

### Supabase Client

- `src/integrations/supabase/client.ts` — browser client.
- `src/integrations/supabase/client.server.ts` — server-side client for SSR/server functions.
- `src/integrations/supabase/auth-middleware.ts` — session checks for protected loaders.
- Domain helper modules: `employee-upload.functions.ts`, `role-assignment.functions.ts`.

### Generated Types

`src/integrations/supabase/types.ts` is generated from the live schema and is **read-only**. Use `Database["public"]["Tables"][...]["Row"]` patterns when typing query results.

### Schema (read-only summary)

Core tables grouped by concern:

- **Org**: `entities`, `organisational_departments`, `functional_departments`
- **People**: `people`, `people_roles`, `people_org_departments`, `people_functional_departments`
- **KPIs**: `kpi_definitions`, `corporate_kpis`, `department_kpis`, `individual_kpis` + `*_targets`
- **Actuals**: `actuals` (joined via view `v_kpi_actuals_with_targets`)
- **Weightings**: `drivers`, `employee_kpi_group_weights`, `employee_kpi_item_weights`
- **Bonuses**: `bonus_schemes`, `bonus_scheme_tiers`, `employee_bonus_assignments`
- **Setup**: `setup_progress`
- **Uploads**: `excel_uploads`

Key views: `v_people_public`, `v_employee_weighted_scores`, `v_bonus_projections`, `v_kpi_actuals_with_targets`.

## Feature Flows

### Setup Wizard

`/setup` displays a checklist (`src/components/setup/`). Each step links to a `_setupLayout` route. Completion is tracked in `setup_progress` keyed by `(entity_id, step_key)`.

### KPI Lifecycle

1. **Definition** — `kpi_definitions` row (title, driver, type, unit).
2. **Assignment** — promoted to one of `corporate_kpis`, `department_kpis`, or `individual_kpis` for a given year.
3. **Targets** — `*_targets` rows per period (`q1`/`h1`/`fullyear`/etc.).
4. **Approval** (individual only) — `status` transitions `draft → pending_approval → approved|rejected`.
5. **Actuals** — uploaded into `actuals`, joined for achievement %.

### Weighting Assignment

`/weighting-assignment` lets CEO/managers configure two layers per employee per year:

- **Group weights** (`employee_kpi_group_weights`): Corporate + Department + Individual must sum to **100%**.
- **Item weights** (`employee_kpi_item_weights`): within each group sub-panel, the per-KPI weights must each sum to **100%**.

All four totals are validated client-side; Save is disabled until valid. Persisted via UPSERT (lookup-then-insert/update) keyed on `(person_id, year)` for groups and `(person_id, year, kpi_assignment_id, kpi_level)` for items.

### Bonus Schemes & Tiers

`/bonus-schemes` (CEO only):

- **Schemes** — `bonus_schemes` rows (name, description). Name uniqueness checked case-insensitively per entity.
- **Tiers** — `bonus_scheme_tiers` (min %, max % nullable for "and above", bonus % of salary). New tiers validated against existing ranges:

  ```
  ranges overlap if  aMin ≤ (bMax ?? ∞)  AND  bMin ≤ (aMax ?? ∞)
  ```

Tiers can be deleted via confirmation dialog.

### Bonus Assignment

`/bonus-assignments` (CEO + manager):

- CEO: all employees in the entity.
- Manager: only employees in their `people_org_departments` departments.

Assignment modal upserts `employee_bonus_assignments` keyed on `(person_id, year)`, capturing scheme + mid-year/year-end eligibility toggles.

## Design System

- Tokens defined in `src/styles.css` using `oklch` for perceptual uniformity.
- Tailwind v4 native `@import` + `@theme` flow (no `tailwind.config.js`).
- Components consume semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.) — never raw color values.
- shadcn/ui primitives in `src/components/ui/` are extended via `cva` variants when needed.

## Conventions

- **Edits are small and targeted.** UI work stays in components; data work stays in helpers/contexts.
- **No schema changes from the app.** Adjust the Supabase schema externally and regenerate types.
- **Server-safe code only in server contexts.** Avoid Node-only npm packages in SSR or server functions.
- **All async data loads** show explicit loading/empty/error states (see `bonus-schemes.tsx` for the canonical pattern).

## Out of Scope (today)

- Bulk-copy of weightings across employees.
- Historical-year editing for weightings.
- Self-service password reset UI (handled via Supabase Auth directly).
- Notifications / email delivery.
