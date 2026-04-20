
## Goal
Add Step 2 to the Employee Upload screen: a `.xlsx` file picker + Upload button that parses the file, runs all 7 validations across all rows, collects errors, and opens an Upload Validation Modal listing them. No inserts in this step.

## Files touched

### 1. `src/routes/_authenticated/employee-upload.tsx` (edit)
Replace the "Step 2 — Upload File / Coming soon" placeholder card with a working Step 2 section:
- Hidden `<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">` triggered by a styled "Choose file" button (shadcn `Button` + `Input`).
- Display the selected file name once chosen.
- "Upload" button — disabled until a file is selected; shows a loading state during parse + validation.
- On click → `handleUpload()`:
  1. Read the file as ArrayBuffer.
  2. `XLSX.read` → take sheet `Employees` (fallback to first sheet).
  3. `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" })` → 2D array.
  4. Treat row 0 as header; map column indexes to the 9 known field names. Skip the optional example row only if its first cell exactly equals `EMP001` AND first_name `Jane` AND email `jane.smith@company.com` (template artifact). All other rows are data.
  5. Skip fully blank rows.
  6. Run validations (below) against `useEntity().entity_id`.
  7. If `errors.length > 0` → open `UploadValidationModal`. Else → toast "All rows valid — insert step coming soon" (no DB writes per task scope).

### 2. Validation logic (inline helpers in the same file)
For each data row (1-indexed for user display, where row 1 = first data row under headers):

1. **Required fields**: `first_name`, `last_name`, `email`, `org_department`, `functional_department`, `role` — push `{ row, field, error: "Required field missing: <field>" }` for each empty/whitespace-only.
2. **Duplicate email** (entity-scoped): batch one query up-front —
   ```ts
   supabase.from("people").select("email").eq("entity_id", entity_id).in("email", emails)
   ```
   Build a `Set<string>` of existing emails (lowercased, trimmed). For each row whose email is in the set → `{ row, field: "email", error: "Duplicate email" }`. Also flag in-file duplicates (same email appearing twice in the upload).
3. **Org department exists**: batch fetch —
   ```ts
   supabase.from("organisational_departments").select("name").eq("entity_id", entity_id)
   ```
   Build `Set<string>` of names. For each row whose `org_department` value is non-empty and not in the set → `{ row, field: "org_department", error: "Org department not found: <value>" }`.
4. **Functional department exists**: batch fetch —
   ```ts
   supabase.from("functional_departments").select("name")
   ```
   (no entity scope per current schema). Same membership check → `{ row, field: "functional_department", error: "Functional department not found: <value>" }`.
5. **Salary numeric (if provided)**: if `annual_salary` is non-empty and `Number.isFinite(Number(value))` is false → `{ row, field: "annual_salary", error: "Salary must be a number" }`.
6. **Date valid (if provided)**: if `employment_start_date` non-empty, require strict `YYYY-MM-DD` regex AND a valid `Date` parse → `{ row, field: "employment_start_date", error: "Invalid date format, use YYYY-MM-DD" }`. SheetJS may return a JS `Date` for date-typed cells — accept that too and reformat to `YYYY-MM-DD`.
7. **Role enum**: trim + lowercase; must be one of `ceo`, `manager`, `hr_rep`, `employee` → otherwise `{ row, field: "role", error: "Invalid role value" }`.

Order is preserved per row (validation 1 → 7), and within validation 1 the field order is the spec order. All rows fully validated before any UI is shown.

### 3. New component: `UploadValidationModal` (inline in same file, or `src/components/employee-upload/UploadValidationModal.tsx`)
- Built on shadcn `Dialog`.
- Title: "Upload Validation Errors".
- Description: count summary, e.g. "Found 7 errors across 4 rows. Please fix the file and try again."
- Body: shadcn `Table` with columns **Row**, **Field**, **Error**, scrollable (`max-h-96 overflow-auto`).
- Footer: single "Close" button. No "Continue / Insert" action — inserts are out of scope.
- Errors sorted by row, then by the canonical field order from HEADERS.

### 4. State in `EmployeeUploadPage`
- `selectedFile: File | null`
- `isValidating: boolean`
- `errors: ValidationError[]`
- `modalOpen: boolean`
- `entity_id` from `useEntity()` — guard with "Loading entity…" if null/loading; Upload button disabled until ready.

## What I am NOT doing
- No inserts into `people`, `people_roles`, `people_org_departments`, `people_functional_departments`, or `excel_uploads`. That is the next step.
- No new Supabase tables, columns, or RLS changes.
- No template/format changes to Step 1.
- No reassignment / fix-in-place flow inside the modal — close-only.

## Verification checklist
- Pick a non-`.xlsx` file → file picker rejects it (accept attribute) and Upload stays disabled.
- Upload the unmodified template (only example row) → example row is skipped, toast "All rows valid".
- Upload a file with: blank `email`, a duplicate of an existing person's email, unknown org dept, unknown functional dept, salary `"abc"`, date `"15/01/2024"`, role `"admin"` → modal opens listing every offending row/field/error in the wording specified.
- Multiple errors on the same row all appear as separate entries.
- Same email appearing twice in the upload itself is flagged as Duplicate email on the second (and later) occurrences.
- Closing the modal returns to the page with the file still selected so the user can retry after fixing.
