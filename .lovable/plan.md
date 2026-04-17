
Goal: HR Rep can log in → Dashboard → Setup Checklist → click "Go" on Register Entity → land on `/register-entity` (no redirect bounce) → see form prepopulated from existing entity (if any) → click Continue → go to `/org-departments`.

## Root cause of the current bounce

In `src/routes/_authenticated.tsx` there is this redirect:

```ts
if (isHrRep && entity_id && onRegisterEntity) {
  navigate({ to: "/org-departments", replace: true });
}
```

Because Angela's `people.entity_id` is non-null (DB requires it), `entity_id` is always set, so the moment she lands on `/register-entity` this guard fires and ejects her to `/org-departments`. That is the redirect she's seeing.

The page-level guard in `register-entity.tsx` also requires `hr_rep` and is fine, but the layout-level eject runs first.

## Fix plan (4 small edits, no DB changes)

### 1. `src/routes/_authenticated.tsx` — remove the auto-eject from `/register-entity`
- Keep: redirect to `/login` if no session.
- Keep: redirect HR Rep with NO entity to `/register-entity` (covers the "true onboarding" case if it ever arises).
- REMOVE: the `isHrRep && entity_id && onRegisterEntity → /org-departments` block. Navigation away from `/register-entity` should only happen when the user clicks Continue, never automatically.
- Remove the `shouldHoldRegisterEntity` special-case (no longer needed) and let `/register-entity` render inside the normal auth-resolved flow without the AppShell.

### 2. `src/routes/_authenticated/register-entity.tsx` — make it work for both new and existing entities
- Keep `hr_rep` gate.
- On mount, if `entity_id` already exists, fetch that entity row (`id, name, industry`) from `entities` and prepopulate the form fields.
- Submit logic becomes:
  - If no existing `entity_id`: INSERT into `entities`, then `setEntity(...)`, then navigate to `/org-departments`.
  - If existing `entity_id`: UPDATE the existing entity row with the (possibly edited) name/industry, then `setEntity(...)`, then navigate to `/org-departments`.
- Button label: "Register Company" when creating, "Continue" when an entity already exists.
- Keep temporary console logs for now.

### 3. `src/routes/_authenticated/setup.tsx` — wire the "Go" button for Register Entity
- For the `register_entity` step, change the button `onClick` from the "coming soon" toast to `navigate({ to: "/register-entity" })`.
- Leave the other steps as "coming soon" for now.

### 4. `src/routes/index.tsx` and `src/routes/login.tsx` — confirm post-login destination is `/dashboard`
- Verify the post-auth redirect for an HR Rep WITH an entity goes to `/dashboard` (not `/org-departments` or `/register-entity`). Adjust the guarded effect if needed so the success criterion "logged in → dashboard" holds.

## Files touched
- `src/routes/_authenticated.tsx` (remove auto-eject)
- `src/routes/_authenticated/register-entity.tsx` (prepopulate + update path)
- `src/routes/_authenticated/setup.tsx` (wire Go button)
- `src/routes/index.tsx` and/or `src/routes/login.tsx` (ensure default lands on `/dashboard`)

## What I am NOT doing
- No DB schema changes (per workspace rule).
- No new tables.
- No changes to `AuthContext` / `EntityContext` logic — they are already correct; the bug is purely the layout-level eject.

## Expected result
- Login as Angela (hr_rep, has entity) → `/dashboard`.
- Open `/setup` → click "Go" on Register Entity → `/register-entity` loads and STAYS, prepopulated with her entity name + industry.
- Click "Continue" → entity row updated → navigates to `/org-departments`.
