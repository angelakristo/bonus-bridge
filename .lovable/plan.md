
## Goal
Build the **Role Assignment Screen** at `/role-assignment` for `hr_rep` (and `ceo`). Lists all people in the current entity ordered by `last_name`, shows their current roles as colored chips, and provides an Edit modal to add/remove roles in `people_roles` with a "must have at least one role" guard.

## Files touched

### 1. Edit `src/components/setup/steps.ts`
Add `route: "/role-assignment"` to the existing `assign_roles` step so the checklist links to it and can tick green automatically.

### 2. New: `src/components/role-assignment/RoleChip.tsx`
Approval Status Chip — small colored label per role. Uses shadcn `Badge` with role-specific Tailwind classes:
- `ceo` → purple, `manager` → blue, `hr_rep` → amber, `employee` → slate.
Accepts `role: "ceo" | "manager" | "hr_rep" | "employee"`.

### 3. New: `src/components/role-assignment/EditRolesModal.tsx`
shadcn `Dialog` with:
- Title: `Edit Roles — {first_name} {last_name}`.
- Body: 4 `Checkbox` rows (ceo, manager, hr_rep, employee), pre-checked from the person's current roles.
- Inline error region (`text-destructive text-sm`) shown only when validation fails.
- Footer: `Cancel` and `Save`.
- On Save: if `selected.length === 0` → set inline error `"A person must have at least one role"` and return without calling the server.
- Else call `useServerFn(updatePersonRoles)({ data: { person_id, entity_id, roles: selected[] } })`. On success → toast, close, call `onSaved()` so the parent refetches.

Props: `{ open, onOpenChange, person: { id, first_name, last_name }, currentRoles: UserRole[], entity_id, onSaved }`.

### 4. New: `src/integrations/supabase/role-assignment.functions.ts`
Server function `updatePersonRoles` (uses `supabaseAdmin`, protected by `requireSupabaseAuth`) — needed because `people_roles` has no DELETE policy for end users.

```ts
inputValidator: z.object({
  person_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  roles: z.array(z.enum(["ceo","manager","hr_rep","employee"])).min(1),
})
```

Handler:
1. Verify the person belongs to `entity_id` (defensive: `select id from people where id=person_id and entity_id=entity_id`).
2. Fetch current rows: `select role from people_roles where person_id=...`.
3. Diff:
   - `toAdd = newRoles - existing` → bulk INSERT into `people_roles`.
   - `toRemove = existing - newRoles` → DELETE `where person_id=... and role in (toRemove)`.
4. Re-assert at least one row remains; return `{ ok: true, roles: finalRoles }`.

### 5. New: `src/routes/_authenticated/_setupLayout/role-assignment.tsx`
Route `"/_authenticated/_setupLayout/role-assignment"` so it renders inside `AppShell` + `SetupChecklist`.

Logic:
- Guard: `roles.includes("hr_rep") || roles.includes("ceo")`; otherwise the standard "Access denied" card (same pattern as employee-upload).
- Wait for `entity_id`.
- Single fetch on mount + after save:
  ```ts
  supabase.from("people")
    .select("id, first_name, last_name, email, people_roles(role)")
    .eq("entity_id", entity_id)
    .eq("is_active", true)
    .order("last_name", { ascending: true });
  ```
  (`people_roles` is selectable by `Enable read access for all users`, so the embedded join works under RLS.)
- Render shadcn `Table`:
  - **Full Name** (`{first_name} {last_name}`)
  - **Email**
  - **Current Roles** — flex of `<RoleChip>` for each role, or muted `"No roles"`
  - **Edit** — `<Button size="sm" variant="outline">Edit</Button>` opening the modal for that row.
- Single modal instance at the bottom controlled by `editingPersonId` state; pre-populates `currentRoles` from the cached row. `onSaved` re-runs the people query.
- Empty state (no people): muted card `"No employees yet. Upload your roster first."` linking to `/employee-upload`.

### 6. Optional checklist auto-tick
`_setupLayout.tsx` already covers `register_entity`, `build_org_departments`, `upload_employees`. For `assign_roles` I'll add one extra count query in the same `Promise.all`:
```ts
// people without any role:
supabase.rpc(...) // not available — instead:
supabase.from("people").select("id, people_roles(role)").eq("entity_id", entity_id).eq("is_active", true)
```
Then derive `assign_roles = "complete"` iff every active person has ≥1 role and there is ≥1 person. Falls back to `setup_progress` value otherwise.

(If this proves too chatty I'll keep the derivation read-only and lightweight — same pattern already in use for `upload_employees`.)

## What I am NOT doing
- No DB schema, RLS, enum, or migration changes (workspace rule).
- No bulk-role-edit / multi-select on the table — only one person at a time per spec.
- No role removal of the *current* HR Rep's own access (out of scope; can be addressed later if desired).
- No write to `setup_progress` from this screen — checklist derives status.
- No reuse of the upload modal or any other existing modal — Edit Roles Modal is new.

## Technical notes
- **Why a server function for save**: `people_roles` has SELECT + INSERT policies for authenticated users, but **no UPDATE/DELETE policies**. Removing a role requires `supabaseAdmin`.
- **Why server function input is validated**: defense-in-depth even though the UI restricts to the four enum values.
- **Concurrency**: handler reads current roles inside the request, so two simultaneous edits won't double-insert. Unique `(person_id, role)` pairs are not enforced by a DB constraint per the schema, so the diff approach (insert only missing, delete only removed) is what prevents duplicates.
- **No new dependencies**: `zod`, `xlsx-js-style`, all shadcn components already exist (`Dialog`, `Checkbox`, `Table`, `Badge`, `Button`).

## Verification checklist
- Sign in as `hr_rep` → click "Assign Roles" in the LHS Setup Checklist → lands on `/role-assignment` with `AppShell` + sidebar + checklist all visible.
- Table lists every active person in the entity, sorted by `last_name` ascending.
- Each row's "Current Roles" cell shows colored chips for the roles in `people_roles`; person with no roles shows muted "No roles".
- Click **Edit** on a row → modal opens titled `Edit Roles — Jane Smith`, with the matching role checkboxes pre-checked.
- Uncheck every role → click Save → inline red error `"A person must have at least one role"`, no DB write, modal stays open.
- Add `manager` (previously unchecked), uncheck `employee`, click Save → toast success, modal closes, table re-renders showing `manager` chip and no `employee` chip. Verify in DB: a new `people_roles` row for manager, the old `employee` row deleted.
- Re-open Edit on the same person → manager pre-checked, employee unchecked.
- Sign in as a non-HR/non-CEO user and visit `/role-assignment` directly → "Access denied" card.
- Once every active person has ≥1 role, the "Assign Roles" step shows a green tick in the LHS checklist on next mount.
