
## Goal
Refactor the setup flow so every setup screen (`/register-entity`, `/org-departments`, `/employee-upload`, plus future ones) renders inside the standard AppShell with a persistent **Setup Checklist sidebar on the left side of the page content**. Completed steps show a green tick instead of an enumerated number. The TopNav (logout, etc.) and main app sidebar stay visible at all times.

## Files touched

### 1. New: `src/components/setup/steps.ts`
Extract the `STEPS` array from `setup.tsx` into a shared source of truth, adding a `route?: string` field per step:
```ts
export type SetupStep = { key: string; title: string; description: string; route?: string };
export const STEPS: SetupStep[] = [
  { key: "register_entity", title: "Register Entity", route: "/register-entity", ... },
  { key: "build_org_departments", title: "Build Org Departments", route: "/org-departments", ... },
  { key: "upload_employees", title: "Upload Employees", route: "/employee-upload", ... },
  { key: "assign_roles", title: "Assign Roles", ... },     // no route yet
  ...
];
```

### 2. New: `src/components/setup/SetupChecklist.tsx`
Vertical checklist rendered as the LHS column inside the setup layout:
- Green `CheckCircle2` icon when complete; otherwise the enumerated number in a circle.
- Active step (matching current pathname) gets `bg-accent/40` highlight + bold.
- Each row is a `<Link>` to its `route`. Completed steps remain clickable (so the user can revisit `/register-entity` even when already registered, per spec).
- Steps without a route render disabled with a "Coming soon" hint.
- Props: `progress: Record<string, SetupStepStatus>`, `loading: boolean`.

### 3. New: `src/routes/_authenticated/_setup.tsx` (pathless layout route)
Wraps any child route under it with a 2-column grid:
- LHS (`w-72 shrink-0`): `<SetupChecklist progress={...} />`
- RHS (`flex-1`): `<Outlet />`

Logic:
- `useAuth()`: only `hr_rep` / `ceo` allowed; otherwise render existing "Access denied" card and skip the checklist (no info leak).
- `useEntity()` for `entity_id`. If null we still render the layout, but only `register_entity` is enabled in the checklist.
- Single `Promise.all` batch (when `entity_id` exists):
  - `setup_progress.select("step_key, status").eq("entity_id", entity_id)` — fallback for steps without a screen
  - `organisational_departments.select("id", { head: true, count: "exact" }).eq("entity_id", entity_id)`
  - `people.select("id", { head: true, count: "exact" }).eq("entity_id", entity_id)`
- Derived auto-completion:
  - `register_entity` → complete iff `entity_id` is non-null
  - `build_org_departments` → complete iff org-dept count > 0
  - `upload_employees` → complete iff people count > 0
  - All other keys → fall back to `setup_progress.status` (or `not_started`)
- Result: a pre-registered user landing on `/register-entity` immediately sees a green tick on step 1 without clicking Continue. Same for departments / employees.

### 4. Move existing route files under the layout
- `src/routes/_authenticated/register-entity.tsx` → `src/routes/_authenticated/_setup/register-entity.tsx`
- `src/routes/_authenticated/org-departments.tsx` → `src/routes/_authenticated/_setup/org-departments.tsx`
- `src/routes/_authenticated/employee-upload.tsx` → `src/routes/_authenticated/_setup/employee-upload.tsx`

Update `createFileRoute` strings to `"/_authenticated/_setup/<x>"`. URL paths stay identical because `_setup` is pathless.

### 5. Update `src/routes/_authenticated.tsx` guard
- Delete the `onRegisterEntity` branch that returns `<Outlet />` bare (without AppShell).
- Delete the `shouldHoldRegisterEntity` early return.
- Keep the "hr_rep with no entity → /register-entity" redirect.
- Always wrap `<Outlet />` in `<AppShell>`. ← **this is the core ask**.

### 6. Update `register-entity.tsx`
Strip the full-viewport centered hero treatment (`min-h-[calc(100vh-4rem)]`, gradient blobs, centered card, BonusBridge logo inside the card) since it now lives inside AppShell + setup checklist. Replace with a normal page layout consistent with `/org-departments` and `/employee-upload`:
- `<div className="mx-auto max-w-2xl space-y-6">` wrapping the existing `<Card>` (form unchanged).

### 7. Refactor `setup.tsx`
- Import `STEPS` from `src/components/setup/steps.ts`.
- "Go" button: if `step.route` exists → `navigate({ to: step.route })`; else → existing "Coming soon" toast (drops the `register_entity`-only special case).

### 8. AppSidebar — no functional change
The "Setup" entry still points to `/setup`. The new in-context checklist is *additive* — it shows on the LHS of setup screens; the global app sidebar stays where it is.

## What I am NOT doing
- No Supabase schema changes (workspace rule).
- No automatic writes to `setup_progress` from the layout — derivation is read-only.
- No changes to Step 2 validation logic in `employee-upload.tsx` (only its route path moves).
- No changes to Auth/Entity contexts.
- No new routes for `assign_roles` etc. — they stay greyed in the checklist until built.
- No mobile drawer for the checklist; on small viewports it stacks above content.

## Verification checklist
- `hr_rep` with no entity → routed to `/register-entity`. TopNav with logout visible. LHS checklist shows step 1 highlighted, no green ticks. Other steps disabled.
- After registering → redirected to `/org-departments`. Step 1 shows a green tick. Steps 2+ now clickable.
- Manually navigating back to `/register-entity` shows the prefilled "Continue" form AND step 1 has a green tick.
- `hr_rep` pre-loaded with entity + ≥1 org dept + ≥1 employee → first three steps all green on landing.
- Clicking `/employee-upload` in the LHS keeps the checklist visible; logout still works from TopNav.
- Non-HR/non-CEO hitting `/register-entity` directly → "Access denied" card, no checklist shown.
- Standalone `/setup` page still works; "Go" navigates to the relevant route.
