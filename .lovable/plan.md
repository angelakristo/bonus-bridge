

## Goal
Add an Entity Registration screen for `hr_rep` users with no `entity_id`. Insert into existing `entities` table, refresh `EntityContext`, navigate to Org Department Builder.

## Considerations

**Gating logic**: Currently `EntityContext` derives `entity_id` from `person.entity_id` (set by AuthContext from the `people` row). If a person has no `entity_id`, they can't have a `people` row in the current schema (it's NOT NULL). This means in practice an `hr_rep` invited without an entity wouldn't exist yet. For dev/preview, the dev-preview session sets `entity_id: "dev-preview-entity"` so the gate would never trigger via preview either.

**Decision**: Build the screen and gate by `roles.includes('hr_rep') && !entity_id`. To make it testable in preview, add a separate dev-preview role that injects a person with `entity_id: null` (or treat the existing hr_rep preview as needing registration). Simplest: add `devPreviewSignIn` variant or just allow `entity_id` to be nullable on the Person type and add a second preview button "HR Rep (no entity)".

**Org Department Builder route**: Doesn't exist yet. Per prior decision, all setup steps toast "Coming soon". After registration we'll navigate to `/setup` (the checklist) since the dedicated builder route isn't built — closest equivalent and keeps consistency.

**EntityContext refresh**: Currently re-fetches when `person.entity_id` changes. After registering an entity, the user's `people` row still has no `entity_id` link (we're only inserting into `entities`, not creating a people row or linking). We need to update EntityContext locally with a setter, since person.entity_id won't change.

**Schema reality**: The `entities` table has no RLS policies (per scan). INSERT will work for any authenticated user. We won't add RLS in this round — flagging as a known gap.

## Plan

### 1. `src/contexts/EntityContext.tsx` — add a manual setter
- Expose `setEntity(id, name)` so the registration screen can populate context after insert without waiting for a refetch.
- Keep existing person-driven load behavior.

### 2. `src/routes/_authenticated/register-entity.tsx` (new)
- `createFileRoute("/_authenticated/register-entity")`.
- Use react-hook-form + zod for `name` (required, 1–200 chars) and `industry` (optional, max 200).
- Card-centered layout, BonusBridge logo at top, matching login styling (gradient bg, rounded inputs).
- Submit handler: `supabase.from("entities").insert({ name, industry }).select("id, name").single()`. On success: `setEntity(data.id, data.name)`, toast success, `navigate({ to: "/setup" })`.
- On error: toast error message.

### 3. `src/routes/_authenticated.tsx` — add gate
- After auth check, if `roles.includes('hr_rep') && !entity_id && !loading` AND current path !== `/register-entity`, redirect to `/register-entity`.
- Conversely, if user has entity_id and is on `/register-entity`, redirect to `/dashboard`.

### 4. `src/contexts/AuthContext.tsx` — preview helper tweak
- Allow `Person.entity_id` to be `string | null`.
- Add a second preview behavior: when previewing as `hr_rep`, set `entity_id: null` so the registration flow is reachable. (Other roles keep `dev-preview-entity`.)

### 5. `src/routes/login.tsx` — minor
- No changes needed; existing HR Rep preview button will now route into registration.

## Files

```text
NEW  src/routes/_authenticated/register-entity.tsx
EDIT src/contexts/EntityContext.tsx          (add setEntity)
EDIT src/contexts/AuthContext.tsx            (Person.entity_id nullable; hr_rep preview = no entity)
EDIT src/routes/_authenticated.tsx           (gate redirect)
```

No DB migrations. Uses existing `entities` table.

## Known gaps (not in scope, flagged)
- `entities` table has no RLS policies — INSERT will succeed for any authenticated user. Should be tightened in a security pass.
- Registering an entity does not link the current user's `people` row to it. Without that link, `EntityContext`'s person-driven refetch on next login won't find the new entity. We rely on the manual `setEntity` for this session. Linking people→entity is a separate flow.

