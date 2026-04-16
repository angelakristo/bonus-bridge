

## Goal
Build a persistent, role-aware app shell with brand styling (BonusBridge palette inspired by Factorial HR). Layout = top nav + sidebar + content. All authenticated pages share this shell.

## Brand assets & theme

1. **Copy logo assets** from uploads to `src/assets/`:
   - `bonusbridge-icon.png` ← `image.png` (bridge thumbnail, used top-left)
   - `bonusbridge-full.png` ← `image-4.png` (full vertical lockup, for login screen)

2. **Update `src/styles.css`** color tokens to BonusBridge palette (oklch):
   - Primary: deep navy (BonusBridge "Bonus" blue) — `oklch(0.32 0.09 240)`
   - Accent / secondary: teal-green (BonusBridge "Bridge" teal) — `oklch(0.62 0.13 180)`
   - Backgrounds: very light cool grey (`oklch(0.985 0.005 240)`) — Factorial-style clean.
   - Sidebar: white surface with subtle border, sidebar-accent = light teal tint.
   - Increase rounding: `--radius: 0.875rem` (more rounded, Factorial-like).
   - Keep dark mode tokens proportionally adjusted.

## Files to create

3. **`src/routes/_authenticated.tsx`** — pathless layout route
   - `beforeLoad` → if no session, `redirect({ to: "/login", search: { redirect: location.href } })`. Reads auth via a tiny client check using `supabase.auth.getSession()` (since router context doesn't currently carry auth — simpler: render an inline guard inside `component` using `useAuth()` to avoid restructuring router context).
   - Approach chosen: **component-level guard** inside `_authenticated.tsx` using `useAuth()`. While the docs prefer `beforeLoad`, our `AuthContext` lives in React state — wiring it into router context is out of scope for this prompt. We'll show a loading state while `loading=true` and redirect via `<Navigate to="/login" />` when unauthenticated. Documented as a follow-up.
   - Renders `<AppShell><Outlet /></AppShell>`.

4. **`src/routes/_authenticated/index.tsx`** — moves the current dashboard content (welcome card) here as `/`.
   - Delete or repurpose existing `src/routes/index.tsx` → make it a thin redirect wrapper. Actually simpler: keep `index.tsx` as a public welcome that redirects to `/dashboard`, and put the dashboard at `_authenticated/dashboard.tsx`. **But** the prompt says "Employee sees only their own dashboard" → so primary protected page = `/dashboard`.
   - Plan: 
     - `src/routes/index.tsx` → redirects authenticated users to `/dashboard`, unauthenticated to `/login`.
     - `src/routes/_authenticated/dashboard.tsx` → moves the welcome/profile card content here.

5. **`src/components/app-shell/AppShell.tsx`** — wraps `SidebarProvider`, renders `<AppSidebar />` + flex column with `<TopNav />` + `<main>{children}</main>`.

6. **`src/components/app-shell/TopNav.tsx`**
   - Left: BonusBridge icon (logo thumbnail only, ~32px) + `SidebarTrigger`.
   - Center: Year selector (`Select` from shadcn) bound to `useYear()`. Options: current year ±2.
   - Right: 
     - Action Centre bell button (`Bell` icon from lucide) with a `Badge` showing count (placeholder count = 0 for now, prop-driven).
     - User avatar (`Avatar` with initials from `person.first_name/last_name`) inside a `DropdownMenu` → shows name, email, "Sign out" item.

7. **`src/components/app-shell/AppSidebar.tsx`**
   - Uses shadcn `Sidebar` with `collapsible="icon"`.
   - Reads `roles` from `useAuth()`.
   - Nav groups (role-gated):
     - **All roles**: "My Dashboard" → `/dashboard` (Home icon)
     - **CEO + Manager**: "Department View" → `/departments` (Users icon)
     - **CEO + Manager**: "Employee View" → `/employees` (UserCircle icon)
     - **CEO**: "Corporate KPIs" → `/corporate-kpis` (Target icon)
     - **CEO**: "Bonus Schemes" → `/bonus-schemes` (Wallet icon)
     - **HR Rep + CEO**: "Setup" → `/setup` (Settings icon)
     - **HR Rep + CEO**: "Upload Data" → `/uploads` (Upload icon)
   - Helper: `hasAnyRole(roles, ["ceo","manager"])`.
   - Uses `<Link>` + `useLocation()` for active styling via `data-status`/`isActive` prop on `SidebarMenuButton`.
   - Note: target routes don't exist yet → links will 404 if clicked, but that's expected (out of scope for this prompt; only `/dashboard` will exist).

## Files to modify

8. **`src/routes/index.tsx`** — replace dashboard card content with redirect logic only (auth → `/dashboard`, no auth → `/login`).
9. **`src/routes/login.tsx`** — swap the small placeholder for the `bonusbridge-full.png` logo above the card title.
10. **`src/styles.css`** — update color tokens + radius as above.

## Files NOT touched
- `__root.tsx` (providers already correct)
- `AuthContext`, `EntityContext`, `YearContext` (unchanged)
- DB schema (none needed)

## Routes after this change
```
/                       → redirect (public)
/login                  → public
/_authenticated         → layout guard
  /dashboard            → welcome card (all roles)
```
(Other sidebar links won't have routes yet — they'll just 404 if clicked. That's intentional scope.)

## Notes / trade-offs
- Auth guard is **component-level**, not `beforeLoad` (per docs ideal). Reason: `AuthContext` state isn't in router context. Will show "Loading…" briefly, then redirect. Can refactor later by passing auth into router context.
- Action Centre bell is **non-functional placeholder** with badge count = 0 (no notifications system yet).
- Year selector range = currentYear-2 .. currentYear+1.

