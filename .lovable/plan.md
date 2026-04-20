
## Goal
Replace the existing inline validation Dialog in `employee-upload.tsx` with a dedicated **Upload Validation Modal** component that matches the spec exactly: title "Upload Errors Found", error-count subtitle, three-column error table, and two footer buttons — **Close** and **Download Error Report** (xlsx export via SheetJS).

## Files touched

### 1. New: `src/components/employee-upload/UploadValidationModal.tsx`
Self-contained modal component built on shadcn `Dialog` + `Table`.

Props:
```ts
type ValidationError = { row: number; field: string; error: string };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errors: ValidationError[];
};
```

Layout:
- `DialogTitle`: **"Upload Errors Found"**
- `DialogDescription` (subtitle): `Found {errors.length} {errors.length === 1 ? "error" : "errors"} in your file.` (uses total count, per spec — not the row count).
- Body: scrollable container (`max-h-96 overflow-auto rounded-md border`) wrapping shadcn `Table` with three columns:
  - **Row** (`w-20`)
  - **Field** (`w-48`, `font-mono text-xs`)
  - **Error Message**
- Footer (`DialogFooter`): two buttons side by side:
  - `variant="outline"` **Close** → calls `onOpenChange(false)`.
  - `variant="default"` **Download Error Report** → calls `downloadErrorReport(errors)`. Disabled when `errors.length === 0` (defensive; modal shouldn't open in that case).

Download helper (inline in same file):
```ts
function downloadErrorReport(errors: ValidationError[]) {
  const aoa = [
    ["Row", "Field", "Error Message"],
    ...errors.map((e) => [e.row, e.field, e.error]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // bold header row + sensible column widths
  ws["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 60 }];
  for (let c = 0; c < 3; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Upload Errors");
  XLSX.writeFile(wb, "upload_errors.xlsx");
}
```
Uses the already-installed `xlsx-js-style` package (same import as the template generator).

No "Confirm", "Proceed", "Continue", or "Insert" button anywhere — confirmed by spec.

### 2. Edit: `src/routes/_authenticated/_setupLayout/employee-upload.tsx`
- Remove the inline `<Dialog>…</Dialog>` block at the bottom of the page (the current "Upload Validation Errors" dialog and its inline table).
- Remove the now-unused imports: `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`.
- Import and render the new modal:
  ```tsx
  import { UploadValidationModal } from "@/components/employee-upload/UploadValidationModal";
  …
  <UploadValidationModal open={modalOpen} onOpenChange={setModalOpen} errors={errors} />
  ```
- Keep all existing state (`errors`, `modalOpen`, `setModalOpen`) and the existing validation pipeline in `handleUpload` exactly as-is. Continue to call `setModalOpen(true)` only when `collected.length > 0`.
- The existing error-sort logic (by row, then by canonical field order) is preserved so the modal renders rows in deterministic order.

## What I am NOT doing
- No changes to the validation rules or `handleUpload` parse logic.
- No new "Continue / Proceed / Insert" affordance — the modal is purely informational + export.
- No changes to Step 1 (template download).
- No DB writes, no schema changes.
- No changes to setup layout, checklist, or routing.
- Not touching `src/routeTree.gen.ts` (auto-generated).

## Verification checklist
- Trigger a failing upload (e.g. blank required field, unknown department, bad role) → modal opens with title **"Upload Errors Found"** and subtitle **"Found N errors in your file."**.
- Table shows one row per error with **Row / Field / Error Message** columns; long lists scroll inside the modal.
- Click **Close** → modal dismisses, file remains selected so HR Rep can fix and re-upload.
- Click **Download Error Report** → `upload_errors.xlsx` downloads; opening it shows a header row (Row / Field / Error Message) and one row per error matching the on-screen table exactly.
- A successful upload (no errors) does NOT open the modal — existing toast path unchanged.
- No "Confirm" or "Proceed" button appears anywhere in the modal.
