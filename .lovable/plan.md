
Goal: stop the onboarding redirect race so `hr_rep` users with no `entity_id` can stay on `/register-entity`, and only move forward after registration updates `EntityContext`.

What I found:
- The only redirect/navigation logic affecting this flow is in:
  - `src/routes/_authenticated.tsx`
  - `src/routes/index.tsx`
  - `src/routes/login.tsx`
  - `src/routes/_authenticated/register-entity.tsx`
- There is no separate `ProtectedRoute` or `beforeLoad` guard currently doing this.
- The likely race comes from two places:
  1. `AuthContext` bootstraps from both `onAuthStateChange` and `getSession()`, which can resolve at different times.
  2. `EntityContext` clears to `null` immediately whenever `person?.entity_id` is missing, even during bootstrap.
- `_authenticated.tsx` also contains a global redirect that can kick the user off `/register-entity` once state changes, instead of letting the registration screen control the post-success navigation.

Plan:

1. Harden auth bootstrap in `src/contexts/AuthContext.tsx`
- Refactor session/person/roles hydration into one shared resolver.
- Add an explicit “auth ready” state so redirects do not run until auth is fully resolved.
- Add temporary console logs for:
  - authenticated user id
  - resolved role(s)
  - current pathname
  - reason for redirect

2. Add real loading guards in `src/contexts/EntityContext.tsx`
- Make entity resolution wait for auth readiness instead of immediately clearing to `null` during auth bootstrap.
- Keep `EntityContext.loading = true` until the app can confidently say either:
  - the user has an entity, or
  - the user truly has no entity
- Preserve the existing `setEntity(id, name)` path so successful registration updates context immediately.

3. Replace the onboarding redirect logic in `src/routes/_authenticated.tsx`
- Consolidate redirects into one guarded effect that runs only when auth + entity state are resolved.
- Enforce this rule set:
  - no session → `/login`
  - `hr_rep` + no `entity_id` + not already on `/register-entity` → `/register-entity`
  - `hr_rep` + no `entity_id` + already on `/register-entity` → stay there
  - while auth/entity are still loading → do nothing
- Remove/adjust the global redirect that currently pushes users away from `/register-entity` once state changes.
- If needed, render `/register-entity` outside the normal shell while onboarding so it stays the primary screen.

4. Fix the registration success path in `src/routes/_authenticated/register-entity.tsx`
- Keep using the existing `entities` table only.
- On submit:
  - insert `name`, `industry`, and `created_at`
  - call `setEntity(returnedId, returnedName)`
  - navigate directly to `/org-departments` with `replace`
- Add temporary console logs for:
  - user id
  - resolved role
  - resolved `entity_id`
  - current pathname
  - submit success / redirect reason

5. End-to-end verification target
- `hr_rep` with no `entity_id` signs in
- app lands on `/register-entity`
- no redirect away while loading resolves
- submit inserts into `entities`
- `EntityContext` updates immediately
- app navigates to `/org-departments`

Technical details:
- Files to update:
  - `src/contexts/AuthContext.tsx`
  - `src/contexts/EntityContext.tsx`
  - `src/routes/_authenticated.tsx`
  - `src/routes/_authenticated/register-entity.tsx`
- Important note from the current schema snapshot: `entities` currently appears to allow `SELECT` but not `INSERT` for client-side users. I will still fix the redirect/onboarding logic exactly as requested, but if that permission state is still active, the submit step will remain blocked by existing DB access rules rather than routing logic.
