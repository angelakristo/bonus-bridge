/**
 * Regression tests for AddKpiModal save path.
 *
 * Verifies that:
 *  1. Happy path: kpi_definitions INSERT includes period_agg_type, scoring_type,
 *     input_mode, and the legacy kpi_type.
 *  2. Schema fallback: when Supabase returns the "column not in schema cache"
 *     error, the save is retried without the three new fields and a warning
 *     toast is shown (no hard failure).
 *  3. Legacy rows (missing new fields) still load correctly in edit mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── All vi.hoisted blocks run before module imports ────────────────────────────

// Supabase mock state
const supabaseMock = vi.hoisted(() => {
  type MockResponse = { data: unknown; error: { message: string } | null };
  const inserts: Record<string, unknown[]>      = {};
  const queues:  Record<string, MockResponse[]> = {};

  function makeBuilder(table: string): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "filter"])
      b[m] = () => b;
    b["insert"] = (payload: unknown) => {
      inserts[table] = [...(inserts[table] ?? []), payload];
      return makeBuilder(table);
    };
    b["update"]      = () => makeBuilder(table);
    b["upsert"]      = () => makeBuilder(table);
    b["delete"]      = () => makeBuilder(table);
    const dequeue = () =>
      queues[table]?.shift() ?? { data: { id: `mock-${table}-${Date.now()}` }, error: null };
    b["single"]      = () => Promise.resolve(dequeue());
    b["maybeSingle"] = () => Promise.resolve({ data: null, error: null });
    b["then"]        = (res: (r: MockResponse) => void, rej?: (e: unknown) => void) =>
      Promise.resolve(dequeue()).then(res, rej);
    return b;
  }

  const fromFn = vi.fn((t: string) => makeBuilder(t));

  return {
    client: {
      from: fromFn,
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    },
    getInserts: (t: string): unknown[] => inserts[t] ?? [],
    queue: (t: string, r: MockResponse) => { queues[t] = [...(queues[t] ?? []), r]; },
    reset: () => {
      for (const k of Object.keys(inserts)) delete inserts[k];
      for (const k of Object.keys(queues))  delete queues[k];
      fromFn.mockClear();
    },
  };
});

// Toast spies
const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error:   vi.fn(),
  warning: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock.client }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    person: { id: "test-person-id", first_name: "Test", last_name: "User" },
    roles: ["ceo"],
  }),
}));

vi.mock("@/contexts/EntityContext", () => ({
  useEntity: () => ({ entity_id: "test-entity-id" }),
}));

vi.mock("@/contexts/YearContext", () => ({
  useYear: () => ({ selected_year: 2026 }),
}));

vi.mock("sonner", () => ({ toast: toasts }));

// ── Import component after mocks ───────────────────────────────────────────────

import { AddKpiModal } from "@/components/kpi/AddKpiModal";

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  level: "corporate" as const,
  onSuccess: vi.fn(),
};

function renderModal(
  props: Partial<React.ComponentProps<typeof AddKpiModal>> = {},
) {
  return render(<AddKpiModal {...defaultProps} {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AddKpiModal — save path", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    supabaseMock.reset();
    toasts.success.mockClear();
    toasts.error.mockClear();
    toasts.warning.mockClear();
    defaultProps.onSuccess.mockClear();
    defaultProps.onOpenChange.mockClear();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("inserts kpi_definitions with all three calculation-model fields plus legacy kpi_type", async () => {
    supabaseMock.queue("kpi_definitions", { data: { id: "new-kpi-def-id" }, error: null });
    supabaseMock.queue("corporate_kpis",  { data: { id: "new-corp-kpi-id" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/net revenue growth/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Test KPI");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(supabaseMock.getInserts("kpi_definitions").length).toBeGreaterThanOrEqual(1));

    const payload = supabaseMock.getInserts("kpi_definitions")[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      title:           "Test KPI",
      kpi_type:        expect.stringMatching(/progressive|binary|benchmark/),
      period_agg_type: expect.any(String),
      scoring_type:    expect.any(String),
      input_mode:      expect.any(String),
      entity_id:       "test-entity-id",
      year:            2026,
      is_active:       true,
    });
    expect(toasts.error).not.toHaveBeenCalled();
    expect(toasts.warning).not.toHaveBeenCalled();
  });

  it("derives legacy kpi_type = 'progressive' for the default additive_flow model", async () => {
    supabaseMock.queue("kpi_definitions", { data: { id: "kpi-id-2" }, error: null });
    supabaseMock.queue("corporate_kpis",  { data: { id: "corp-id-2" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/net revenue growth/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Revenue");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(supabaseMock.getInserts("kpi_definitions").length).toBeGreaterThan(0));

    const payload = supabaseMock.getInserts("kpi_definitions")[0] as Record<string, unknown>;
    expect(payload.kpi_type).toBe("progressive");
    expect(payload.period_agg_type).toBe("additive_flow");
    expect(payload.scoring_type).toBe("higher_is_better");
    expect(payload.input_mode).toBe("periodic");
    expect(toasts.warning).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  // ── Schema-cache fallback ───────────────────────────────────────────────────

  it("retries without new fields when Supabase returns the schema-cache error for input_mode", async () => {
    supabaseMock.queue("kpi_definitions", {
      data:  null,
      error: { message: "Could not find the 'input_mode' column of 'kpi_definitions' in the schema cache" },
    });
    supabaseMock.queue("kpi_definitions", { data: { id: "fallback-kpi-id" }, error: null });
    supabaseMock.queue("corporate_kpis",  { data: { id: "corp-fallback" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/net revenue growth/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Fallback KPI");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(supabaseMock.getInserts("kpi_definitions").length).toBe(2));

    const [primary, fallback] = supabaseMock.getInserts("kpi_definitions") as Record<string, unknown>[];

    // Primary attempt has the new fields
    expect(primary).toHaveProperty("input_mode");
    expect(primary).toHaveProperty("period_agg_type");
    expect(primary).toHaveProperty("scoring_type");

    // Fallback drops them but keeps kpi_type
    expect(fallback).not.toHaveProperty("input_mode");
    expect(fallback).not.toHaveProperty("period_agg_type");
    expect(fallback).not.toHaveProperty("scoring_type");
    expect(fallback).toHaveProperty("kpi_type");

    expect(toasts.warning).toHaveBeenCalledOnce();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("shows error toast when both primary and fallback inserts fail", async () => {
    supabaseMock.queue("kpi_definitions", {
      data:  null,
      error: { message: "Could not find the 'period_agg_type' column of 'kpi_definitions' in the schema cache" },
    });
    supabaseMock.queue("kpi_definitions", { data: null, error: { message: "Permission denied" } });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/net revenue growth/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Should Fail");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(toasts.warning).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  // ── Legacy row loading ──────────────────────────────────────────────────────

  it("loads a pre-migration row (null new fields) in edit mode without crashing", async () => {
    supabaseMock.queue("kpi_definitions", {
      data: {
        title:           "Old KPI",
        description:     null,
        kpi_type:        "progressive",
        driver:          "growth",
        unit:            "%",
        period_agg_type: null,
        scoring_type:    null,
        input_mode:      null,
      },
      error: null,
    });
    supabaseMock.queue("corporate_kpi_targets", { data: [], error: null });

    renderModal({
      editKpiDefId:   "existing-kpi-id",
      editBoardKpiId: "existing-board-id",
      editBoardLevel: "corporate",
    });

    await waitFor(() => expect(screen.getByDisplayValue("Old KPI")).toBeInTheDocument());
    expect(screen.queryByText(/uncaught error/i)).not.toBeInTheDocument();
  });
});
