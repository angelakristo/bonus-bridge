

## Goal
Build a Login screen + AuthContext that authenticates via Supabase, fetches the user's `people` row + `people_roles`, and exposes everything app-wide.

## Schema confirmation (from existing tables — read-only)
- `people`: `id`, `entity_id`, `first_name`, `last_name`, `email`, `auth_user_id` — RLS uses `get_my_entity_id()` so a logged-in user can SELECT their own row.
- `people_roles`: `id`, `person_id`, `role` (enum `user_role`) — no RLS policy listed; will rely on existing access. Will query by `person_id`.

No DB changes. No new tables. Existing `auth.users` is used by Supabase Auth.

## Files to create

1. **`src/contexts/AuthContext.tsx`**
   - `AuthProvider` + `useAuth()` hook.
   - State: `session`, `supabaseUser`, `person` (`{id, entity_id, first_name, last_name}`), `roles` (`string[]`), `loading`.
   - On mount: set up `supabase.auth.onAuthStateChange` FIRST, then call `getSession()` (per Supabase best practice).
   - When a session exists, fetch person + roles. Use `setTimeout(..., 0)` inside the auth callback before any supabase calls to avoid the known deadlock.
   - Expose `signIn(email, password)` and `signOut()`.
   - Clear person/roles on `SIGNED_OUT`.

2. **`src/routes/login.tsx`**
   - Email + password form (shadcn `Card`, `Input`, `Label`, `Button`).
   - Calls `signIn` from `useAuth()`. Toast errors via `sonner`.
   - If already authenticated, redirect to `/`.
   - On success, navigate to `/` (or `?redirect=` search param if present).

3. **`src/routes/__root.tsx`** (modify)
   - Wrap `<Outlet />` with `<AuthProvider>` inside `RootComponent`.
   - Mount `<Toaster />` from `@/components/ui/sonner`.

4. **`src/routes/index.tsx`** (modify)
   - Replace placeholder. If not authenticated → redirect to `/login`.
   - If authenticated → simple landing showing `Welcome, {first_name}`, entity id, roles list, and a Sign out button. (Minimal — real dashboard comes later.)

## Auth flow

```text
Login form → supabase.auth.signInWithPassword
        ↓
onAuthStateChange fires (SIGNED_IN)
        ↓
setTimeout(0) → fetch people row (auth_user_id = user.id)
             → fetch people_roles (person_id = people.id)
        ↓
AuthContext state populated → app re-renders
```

## Notes
- No `/signup` or password reset in this step (not requested). Users must already exist in `auth.users` AND have a matching `people` row with `auth_user_id` set.
- No protected route layout (`_authenticated`) added yet — only `index.tsx` checks auth. We can add `_authenticated/` layout later when more protected pages exist.
- Session persists via `localStorage` (already configured in `client.ts`).

