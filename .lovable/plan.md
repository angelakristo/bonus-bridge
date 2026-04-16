

## Goal
Add two new React contexts on top of the existing `AuthContext`:

1. **`EntityContext`** — exposes `entity_id` and `entity_name`, populated from the `entities` table after login.
2. **`YearContext`** — exposes `selected_year` (number) and a setter, defaulting to the current calendar year.

## Files to create

1. **`src/contexts/EntityContext.tsx`**
   - `EntityProvider` reads `person.entity_id` from `useAuth()`.
   - When `entity_id` is available, query `entities` table: `select('id, name').eq('id', entity_id).maybeSingle()`.
   - State: `entity_id: string | null`, `entity_name: string | null`, `loading: boolean`.
   - Resets to nulls when user signs out (entity_id becomes null).
   - Hook: `useEntity()`.

2. **`src/contexts/YearContext.tsx`**
   - `YearProvider` with state `selected_year: number` (default `new Date().getFullYear()`) and `setSelectedYear(year)`.
   - Hook: `useYear()`.

## Files to modify

3. **`src/routes/__root.tsx`**
   - Wrap `<Outlet />` inside the existing `<AuthProvider>` with `<EntityProvider>` then `<YearProvider>`.
   - Order: `AuthProvider → EntityProvider → YearProvider → Outlet` (Entity depends on Auth; Year is independent but placed inside for consistent access).

## Notes
- No DB changes. Uses existing `entities` table (RLS via `get_my_entity_id()` — the user can SELECT their own entity).
- `YearContext` is purely client-side, no DB.
- Will not modify `index.tsx` to display entity_name (out of scope — only contexts requested), but contexts will be available app-wide for future pages.

