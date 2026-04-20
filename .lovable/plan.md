
## Goal
Make the already-wired Edit and Delete buttons on the Org Department Builder actually work by adding the missing RLS policies. No UI changes, no new tables.

## Why UI changes aren't needed
`src/routes/_authenticated/org-departments.tsx` already contains:
- `AddOrEditModal` — handles both add and edit, prefills name + parent, runs `UPDATE organisational_departments` on edit.
- `DeleteDialog` — queries `people_org_departments` for count, shows the exact required message, disables confirm when assigned, runs `DELETE` otherwise.
- Invalid-parent protection (cannot set self/descendant as parent).
- Page-level role gate (`hr_rep` or `ceo`).

The wiring is correct. The blocker is the database.

## Database changes (single migration)

Add RLS policies so scoped users can actually mutate their own entity's data.

### `organisational_departments`
- `UPDATE`: allow when `entity_id = get_my_entity_id()` AND caller has `hr_rep` or `ceo`.
- `DELETE`: allow when `entity_id = get_my_entity_id()` AND caller has `hr_rep` or `ceo`.

(Existing SELECT and INSERT policies stay as-is.)

### `people_org_departments`
Currently has zero policies, so RLS blocks all reads — the delete-guard count check silently returns 0. Add:
- `SELECT`: allow when the linked person belongs to the caller's entity
  (`person_id IN (SELECT id FROM people WHERE entity_id = get_my_entity_id())`).

No INSERT/UPDATE/DELETE policies added here — out of scope for this task.

## Files touched
- One new migration file under `supabase/migrations/` with the three policies above.
- No changes to `src/routes/_authenticated/org-departments.tsx`.
- No changes to any other source file.

## Verification checklist
- Log in as `hr_rep`, open Org Department Builder.
- Click Edit on a node → modal opens prefilled with current name and parent → change name → Save → row updates, tree refreshes.
- Click Edit → change parent to a different node → Save → tree reflects new hierarchy. Self/descendants are not selectable.
- Click Delete on a node with zero assignments → standard warning → confirm → row deleted, tree refreshes.
- Assign a person to a department via `people_org_departments` (manual insert for test), click Delete → modal shows "This department has people assigned to it. Reassign them before deleting." and the confirm button is disabled.

## Out of scope
- No new tables.
- No changes to `people_org_departments` write policies (reassignment flow is a separate feature).
- No UI changes.
