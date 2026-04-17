
Why it does not work now:

1. The screen itself already exists and the submit logic is basically correct. The failure is in the onboarding state model + redirect flow around it.

2. There are two separate problems:
- Redirect churn:
  - `src/routes/login.tsx` sends a signed-in/preview user to `/`
  - `src/routes/index.tsx` immediately sends any session to `/dashboard`
  - `_authenticated.tsx` then tries to send `hr_rep` users without an entity to `/register-entity`
  - That means the app is bouncing between routes instead of choosing the onboarding route once.
- Schema/state mismatch:
  - `EntityContext` derives `entity_id` from `person.entity_id`
  - In your actual schema, `people.entity_id` is `NOT NULL`
  - So a real database-backed user cannot truly be `hr_rep` with `entity_id = null` in `people`
  - That means the condition from the prompt is only naturally reachable in preview/mock state, not through the current persisted profile shape

3. There is also a persistence gap:
- `/register-entity` inserts into `entities` and updates `EntityContext` locally
- but it does not write the new `entity_id` back to the user’s existing `people` row
- so even if the current session moves forward, a later re-hydration can fall out of sync

Can I fix it?
- Yes, I can fix the redirect race in code.
- I can also make the onboarding route become the single source of truth for preview/onboarding flow.
- But for real authenticated users, the exact state “`hr_rep` + no `entity_id` in `EntityContext` because profile has none” conflicts with the current `people.entity_id NOT NULL` schema, so that part is not just a UI bug.

What I would change:

1. `src/routes/login.tsx`
- Stop blindly sending every successful sign-in/preview to `/`
- After auth resolves, choose the destination once:
  - `hr_rep` + no entity => `/register-entity`
  - otherwise normal app route
- This removes the first bounce

2. `src/routes/index.tsx`
- Remove the unconditional “session => `/dashboard`” redirect
- Make `/` respect onboarding state instead of forcing dashboard first
- This removes the second bounce

3. `src/routes/_authenticated.tsx`
- Keep one guarded redirect effect only
- Do nothing until auth, roles/person, and entity are all resolved
- If `hr_rep` and no entity:
  - already on `/register-entity` => stay there
  - not on `/register-entity` => send there
- Only leave `/register-entity` after `EntityContext` has a real id

4. `src/contexts/AuthContext.tsx`
- Ensure auth bootstrap resolves once without late stale updates overriding route decisions
- Keep the temporary console logs here

5. `src/contexts/EntityContext.tsx`
- Do not clear entity state until auth/profile resolution is truly finished
- Preserve the manual `setEntity` override after registration so the success navigation is not undone

6. `src/routes/_authenticated/register-entity.tsx`
- Keep the existing `entities` insert
- Keep `setEntity(returnedId, returnedName)`
- Keep navigation to `/org-departments`
- Keep temporary console logs

Important limitation to be aware of:
- Even after the redirect fix, a real DB-backed `hr_rep` with `people.entity_id = null` is not representable with the current schema you shared.
- So I can fix the route race, but if you want this to work for real signed-in users rather than preview/mock users, the current persisted onboarding state does not fully line up with the requirement.

Files I would audit/update for the actual fix:
- `src/routes/login.tsx`
- `src/routes/index.tsx`
- `src/routes/_authenticated.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/EntityContext.tsx`
- `src/routes/_authenticated/register-entity.tsx`
