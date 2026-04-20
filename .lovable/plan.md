
## Goal
After Step 2 validation passes with **zero errors**, persist each row to Supabase, send an Auth invite to each new employee, log the upload to `excel_uploads`, and show a success banner. The Auth admin call requires the service role key, so the persistence runs in a **TanStack server function** that uses `supabaseAdmin`.

## Files touched

### 1. New: `src/integrations/supabase/employee-upload.functions.ts`
Server function `commitEmployeeUpload`. Protected by `requireSupabaseAuth` so only signed-in users can invoke it; all DB writes go through `supabaseAdmin` (bypasses RLS — necessary because `excel_uploads` has no SELECT/UPDATE policies and `people_*_departments` have no INSERT policies for end users).

```ts
export const commitEmployeeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    entity_id: z.string().uuid(),
    uploaded_by_person_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    rows: z.array(z.object({
      first_name: z.string(),
      last_name: z.string(),
      email: z.string().email(),
      annual_salary: z.string(),         // empty → null
      employment_start_date: z.string(), // empty → null
      role: z.enum(["ceo","manager","hr_rep","employee"]),
      org_department: z.string(),
      functional_department: z.string(),
    })).min(1).max(2000),
  }).parse)
  .handler(async ({ data }) => { /* see "Per-row pipeline" below */ });
```

**Pre-flight (one round trip each):**
- `supabaseAdmin.from("organisational_departments").select("id, name").eq("entity_id", data.entity_id)` → `Map<name, id>`.
- `supabaseAdmin.from("functional_departments").select("id, name")` → `Map<name, id>`.
- (The validation step already proved these names exist; we just resolve to IDs.)

**Per-row pipeline (sequential, in spec order):**
1. **INSERT `people`** — `{ entity_id, first_name, last_name, email, annual_salary: salary===""?null:Number(salary), employment_start_date: date===""?null:date, is_active: true }` → `.select("id").single()` → capture `person_id`.
2. **INSERT `people_roles`** — `{ person_id, role }` (one row per person, per spec).
3. **INSERT `people_org_departments`** — `{ person_id, org_department_id: orgMap.get(row.org_department) }`.
4. **INSERT `people_functional_departments`** — `{ person_id, functional_department_id: funcMap.get(row.functional_department) }`.
5. **Auth invite** — `supabaseAdmin.auth.admin.inviteUserByEmail(row.email)`. If success: `update people set auth_user_id = data.user.id where id = person_id`. If invite fails (e.g. email already a Supabase user), record the row in a per-row `inviteFailures: { email, reason }[]` array and **continue** — the people record stays, just without `auth_user_id`. Surfaced in the response so the UI can warn.
6. Push `person_id` to `insertedPersonIds`. On any DB error in steps 1-4, abort the loop, attempt best-effort cleanup of partially-inserted child rows for *that* row only, and **return an error result** — earlier rows already committed are reported back so the user knows.

**After loop:**
- INSERT one row into `excel_uploads`:
  ```ts
  { entity_id, uploaded_by: data.uploaded_by_person_id, file_name: data.file_name,
    upload_type: "employees", status: "success", row_count: insertedPersonIds.length }
  ```
- Return `{ inserted: number, inviteFailures: {email, reason}[], partialError?: string }`.

### 2. Edit: `src/routes/_authenticated/_setupLayout/employee-upload.tsx`
- Replace the current `toast.success("All rows valid — insert step coming soon.")` branch with:
  ```ts
  const { inserted, inviteFailures, partialError } = await commitFn({ data: { entity_id, uploaded_by_person_id: person.id, file_name: selectedFile.name, rows: payload } });
  ```
- Use `useServerFn(commitEmployeeUpload)` to get `commitFn`. Pull `person` from `useAuth()` (already available) for `uploaded_by`.
- New `isCommitting` state; reuse the existing `Loader2` spinner and disable buttons.
- On success → `toast.success(\`${inserted} employees uploaded successfully. Invite emails sent.\`)`. If `inviteFailures.length > 0`, follow up with a `toast.warning` listing the affected addresses (truncated). If `partialError` → `toast.error` with the message and the partial count.
- After success, clear `selectedFile`, reset the file input, and let the persistent `SetupChecklist` (which counts `people` rows on next mount) auto-tick "Upload Employees" on the next navigation.
- Build the `payload` array from the already-validated `dataRows` (lowercased role, trimmed values) — **do not re-fetch or re-validate** in the handler beyond what the server function already does.

### 3. No schema or RLS changes
Per workspace rule: no Supabase migrations. The server function uses `supabaseAdmin` (service role) which already has full access; no policies need editing.

### 4. Auth invite redirect
`inviteUserByEmail(email)` uses Supabase's default Site URL. No second arg needed for v1; if a custom landing is wanted later we can pass `{ redirectTo: \`${SITE_URL}/login\` }`. Out of scope here.

## Technical notes
- **Why `supabaseAdmin`**: `excel_uploads` has only an INSERT policy (no SELECT/UPDATE), `people_org_departments` and `people_functional_departments` have no end-user INSERT policies, and `auth.admin.inviteUserByEmail` requires the service role. All five operations require server-side execution.
- **Validation already ran**: org/func dept names, role enum, email uniqueness, salary numeric, and date format are all guaranteed by Step 2 — the server function trusts the payload but still uses Zod as a defensive layer.
- **Sequential vs parallel**: rows are processed sequentially so a mid-loop failure produces a clean `partialError` with an accurate inserted count. Per-row work itself is fast (4 inserts + 1 invite); typical rosters of <500 employees finish in seconds.
- **Idempotency**: If the user retries after a partial failure, Step 2's email-duplicate check will catch already-inserted rows and force them to fix the file before re-upload.
- **No new packages**: `zod` and `@supabase/supabase-js` are already in the project.

## What I am NOT doing
- No Supabase schema, RLS, or trigger changes.
- No edits to `setup_progress` writes (the checklist auto-derives from `people` count).
- No retry UI for failed invites (just a toast warning).
- No background job — invites are sent inline during the request. For very large rosters this could be slow; out of scope.
- No update to the `UploadValidationModal` (only fires on validation errors, never reached on the success path).
- No changes to Step 1 template.

## Verification checklist
- Upload a valid 3-row file as an `hr_rep`. Expect:
  - 3 new rows in `people` with correct `entity_id` and a populated `auth_user_id`.
  - 3 new rows in `people_roles` matching the file's role values.
  - 3 new rows each in `people_org_departments` and `people_functional_departments` linked to the right department IDs.
  - 1 new row in `excel_uploads` with `status='success'`, `row_count=3`, `upload_type='employees'`, `uploaded_by` = current user's `person.id`.
  - 3 invite emails received at the test addresses.
  - Toast: **"3 employees uploaded successfully. Invite emails sent."**
- Upload a row whose email is already a Supabase Auth user → people row inserted, `auth_user_id` left null, follow-up toast warns about the failed invite, `excel_uploads` still success.
- Force a mid-loop DB failure (e.g. temporarily corrupt one org dept name on the server side) → partial error toast with the count of rows that did succeed, no `excel_uploads` row written.
- Re-upload the same file → Step 2 validation now flags every row as Duplicate email; success path is never reached.
- Navigate back to `/setup` after success → "Upload Employees" step shows a green tick (derived from `people` count).
