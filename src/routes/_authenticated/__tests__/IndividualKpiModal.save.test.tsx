/**
 * Regression tests for AddIndividualKpiModal save path (weighting-assignment).
 *
 * Verifies that:
 *  1. Happy path: kpi_definitions INSERT includes period_agg_type, scoring_type,
 *     input_mode, and the legacy kpi_type — same contract as AddKpiModal.
 *  2. Schema fallback: when Supabase returns the "column not in schema cache"
 *     error, the save retries without the three new fields and shows a warning.
 *  3. Legacy rows (null new fields) still load correctly in edit mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── vi.hoisted: all mock state self-contained ──────────────────────────────────

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

// TanStack Router: createFileRoute is curried — createFileRoute(path)({ component })
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (obj: object) => obj,
  Link:            ({ children }: { children: React.ReactNode }) => children,
  useNavigate:     () => vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({}));

vi.mock("sonner", () => ({ toast: toasts }));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { AddIndividualKpiModal } from "@/routes/_authenticated/weighting-assignment";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PERSON_ID = "person-abc";
const ENTITY_ID = "entity-xyz";
const YEAR      = 2026;

function renderModal(
  extra: Partial<React.ComponentProps<typeof AddIndividualKpiModal>> = {},
) {
  return render(
    <AddIndividualKpiModal
      open={true}
      onOpenChange={vi.fn()}
      personId={PERSON_ID}
      entityId={ENTITY_ID}
      year={YEAR}
      onSuccess={vi.fn()}
      {...extra}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AddIndividualKpiModal — save path", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    supabaseMock.reset();
    toasts.success.mockClear();
    toasts.error.mockClear();
    toasts.warning.mockClear();
    // The modal always queries people_org_departments on open to load dept KPIs for the dropdown.
    // Queue an empty array so the .map() call doesn't fail with a default-object response.
    supabaseMock.queue("people_org_departments", { data: [], error: null });
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("inserts kpi_definitions with period_agg_type, scoring_type, input_mode and kpi_type", async () => {
    supabaseMock.queue("kpi_definitions", { data: { id: "def-id-1" }, error: null });
    supabaseMock.queue("individual_kpis", { data: { id: "ind-id-1" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/personal revenue target/i);
    await user.clear(titleInput);
    await user.type(titleInput, "My KPI");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(supabaseMock.getInserts("kpi_definitions").length).toBeGreaterThanOrEqual(1));

    const payload = supabaseMock.getInserts("kpi_definitions")[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      title:           "My KPI",
      kpi_type:        expect.stringMatching(/progressive|binary|benchmark/),
      period_agg_type: expect.any(String),
      scoring_type:    expect.any(String),
      input_mode:      expect.any(String),
      entity_id:       ENTITY_ID,
      year:            YEAR,
      is_active:       true,
    });
    expect(toasts.error).not.toHaveBeenCalled();
    expect(toasts.warning).not.toHaveBeenCalled();
  });

  it("derives legacy kpi_type = 'progressive' for the default additive_flow model", async () => {
    supabaseMock.queue("kpi_definitions", { data: { id: "def-id-2" }, error: null });
    supabaseMock.queue("individual_kpis", { data: { id: "ind-id-2" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/personal revenue target/i);
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

  it("retries without new fields on schema-cache error and shows warning toast", async () => {
    supabaseMock.queue("kpi_definitions", {
      data:  null,
      error: { message: "Could not find the 'input_mode' column of 'kpi_definitions' in the schema cache" },
    });
    supabaseMock.queue("kpi_definitions", { data: { id: "fallback-def-id" }, error: null });
    supabaseMock.queue("individual_kpis", { data: { id: "fallback-ind-id" }, error: null });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/personal revenue target/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Compat KPI");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(supabaseMock.getInserts("kpi_definitions").length).toBe(2));

    const [primary, fallback] = supabaseMock.getInserts("kpi_definitions") as Record<string, unknown>[];

    expect(primary).toHaveProperty("input_mode");
    expect(primary).toHaveProperty("period_agg_type");
    expect(primary).toHaveProperty("scoring_type");

    expect(fallback).not.toHaveProperty("input_mode");
    expect(fallback).not.toHaveProperty("period_agg_type");
    expect(fallback).not.toHaveProperty("scoring_type");
    expect(fallback).toHaveProperty("kpi_type");

    expect(toasts.warning).toHaveBeenCalledOnce();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("surfaces error toast when both primary and fallback inserts fail", async () => {
    supabaseMock.queue("kpi_definitions", {
      data:  null,
      error: { message: "Could not find the 'scoring_type' column of 'kpi_definitions' in the schema cache" },
    });
    supabaseMock.queue("kpi_definitions", { data: null, error: { message: "Some other error" } });

    renderModal();

    const titleInput = screen.getByPlaceholderText(/personal revenue target/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Double Fail");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(toasts.warning).not.toHaveBeenCalled();
  });

  // ── Legacy row loading ──────────────────────────────────────────────────────

  it("loads a pre-migration row (null new fields) in edit mode without crashing", async () => {
    supabaseMock.queue("kpi_definitions", {
      data: {
        title:           "Legacy KPI",
        description:     null,
        kpi_type:        "binary",
        driver:          "culture",
        unit:            null,
        period_agg_type: null,
        scoring_type:    null,
        input_mode:      null,
      },
      error: null,
    });
    supabaseMock.queue("individual_kpi_targets", { data: [], error: null });

    renderModal({ editKpiDefId: "legacy-def-id", editIndKpiId: "legacy-ind-id" });

    await waitFor(() => expect(screen.getByDisplayValue("Legacy KPI")).toBeInTheDocument());
    expect(screen.queryByText(/uncaught error/i)).not.toBeInTheDocument();
  });

  it("does not call onSuccess after a double save failure", async () => {
    const onSuccess = vi.fn();
    supabaseMock.queue("kpi_definitions", {
      data: null, error: { message: "Could not find the 'input_mode' column of 'kpi_definitions' in the schema cache" },
    });
    supabaseMock.queue("kpi_definitions", {
      data: null, error: { message: "Persistent error" },
    });

    renderModal({ onSuccess });

    const titleInput = screen.getByPlaceholderText(/personal revenue target/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Fail");
    await user.click(screen.getByRole("button", { name: /save kpi/i }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
