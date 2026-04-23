

## Weighting Assignment Screen

A new screen for CEO and Manager roles to assign KPI weight allocations to individual employees for the current year.

### Route & Access

- New route: `src/routes/_authenticated/weighting-assignment.tsx` → `/weighting-assignment`
- Visible to `ceo` and `manager` roles only (gated client-side; access-denied panel otherwise)
- Add sidebar entry "Weightings" with the Scale icon, restricted to `ceo` + `manager`

### Layout

```text
┌────────────────────────────────────────────────────────────┐
│ Weighting Assignment                       Year: 2026      │
│ Employee: [ Select employee ▾ ]                            │
├────────────────────────────────────────────────────────────┤
│ Section 1 — Group Weights                                  │
│ [Corporate %] [Department %] [Individual %]                │
│ Total: 100% of 100%   ✓                                    │
├────────────────────────────────────────────────────────────┤
│ Section 2 — Item Weights                                   │
│ ┌─ Corporate KPIs ─────────────────────────────────────┐   │
│ │ KPI title A                            [ 40 ] %      │   │
│ │ KPI title B                            [ 60 ] %      │   │
│ │ Subtotal: 100% of 100%                               │   │
│ └──────────────────────────────────────────────────────┘   │
│ ┌─ Department KPIs ────────────────────────────────────┐...│
│ ┌─ Individual KPIs ────────────────────────────────────┐...│
├────────────────────────────────────────────────────────────┤
│                                       [ Save weightings ]  │
└────────────────────────────────────────────────────────────┘
```

### Employee Selector

- CEO: list all `people` where `entity_id = current entity`, ordered by name.
- Manager: only people sharing an `org_department_id` with the current manager (`people_org_departments` join, same pattern used by the Action Centre / KPI Approvals screens).
- Defaults to no selection; everything below the selector is hidden until an employee is picked.

### Data Loading (per selected employee + `selected_year` from YearContext)

1. **Group weights** — `employee_kpi_group_weights` row for `(person_id, entity_id, year)`. If none exists, default to 0/0/0.
2. **Corporate items** — `corporate_kpis` for `(entity_id, year)` joined to `kpi_definitions` (title). Each `corporate_kpis.id` is a `kpi_assignment_id`.
3. **Department items** — `department_kpis` for `(entity_id, year)` filtered to departments the employee belongs to (via `people_org_departments` / `people_functional_departments`).
4. **Individual items** — `individual_kpis` for `(person_id, entity_id, year)` joined to `kpi_definitions`.
5. **Existing item weights** — `employee_kpi_item_weights` for `(person_id, entity_id, year)`; map by `kpi_assignment_id` + `kpi_level` to pre-fill inputs. Missing rows default to 0.

### Section 1 — Group Weights

- Three numeric inputs (0–100, integer step 1).
- Live total under the row: `${sum}% of 100%`. Green when `=100`, red when `>100`, muted otherwise.

### Section 2 — Item Weights

- Three sub-panels: Corporate / Department / Individual.
- Each row: KPI title + small driver badge + numeric input.
- Empty state per sub-panel: "No KPIs assigned in this group."
- Sub-total at the bottom of each sub-panel with the same colour rule.

### Save Button

Single Save button at the bottom. Validation before save:
- Group total must equal 100.
- Each non-empty sub-panel sub-total must equal 100.
- Show toast errors listing the failed sections; do not save partial state.

On save (sequential, all writes for `(person_id, entity_id, year)`):
1. **Upsert** `employee_kpi_group_weights` on conflict `(person_id, entity_id, year)` with the three pct values.
2. **Replace** `employee_kpi_item_weights`: delete existing rows for `(person_id, entity_id, year)`, then insert one row per displayed KPI with `kpi_assignment_id` (the corporate/department/individual KPI row id), `kpi_level` (`'corporate' | 'department' | 'individual'`), and `weight_pct`.
3. Toast success; keep employee selected so user sees saved state.

### Reusable Pieces

- `WeightInput` (small component in the route file): numeric input, clamps 0–100, returns number.
- `SubtotalLabel` helper for the coloured `${sum}% of 100%` indicator (shared between group total and sub-panel subtotals).

### Files

- Create `src/routes/_authenticated/weighting-assignment.tsx` (route + page component, employee selector, both sections, save handler).
- Edit `src/components/app-shell/AppSidebar.tsx` (add nav item).
- `src/routeTree.gen.ts` will regenerate automatically.

### Out of Scope

- No schema changes. Uses existing `employee_kpi_group_weights` and `employee_kpi_item_weights` tables exactly as defined.
- No bulk-copy across employees and no historical year editing in this iteration.

