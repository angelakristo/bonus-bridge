/**
 * Chainable Supabase mock for vitest component tests.
 *
 * Usage in a test file:
 *
 *   const mock = vi.hoisted(() => createSupabaseMockState());
 *   vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.client }));
 *
 *   beforeEach(() => mock.reset());
 *
 *   it("...", async () => {
 *     mock.queueResponse("kpi_definitions", { data: { id: "abc" }, error: null });
 *     // render + act ...
 *     expect(mock.getInserts("kpi_definitions")[0]).toMatchObject({ period_agg_type: "additive_flow" });
 *   });
 */

import { vi } from "vitest";

type MockResponse = { data: unknown; error: { message: string } | null };

export function createSupabaseMockState() {
  const inserts: Record<string, unknown[]>    = {};
  const updates: Record<string, unknown[]>    = {};
  const queues:  Record<string, MockResponse[]> = {};

  // Default response per table when the queue is empty
  const defaultId = () => `mock-id-${Math.random().toString(36).slice(2, 9)}`;
  const defaultResponse = (table: string): MockResponse => ({
    data: { id: defaultId(), table },
    error: null,
  });

  function dequeue(table: string): MockResponse {
    return queues[table]?.shift() ?? defaultResponse(table);
  }

  function makeBuilder(table: string): Record<string, unknown> {
    // Use a mutable object so that spread-cloning (insert returns {...b}) still references the same dequeue closure
    const b: Record<string, unknown> = {};

    const chainMethods = ["select", "eq", "neq", "in", "is", "order", "limit", "head", "filter"] as const;
    for (const m of chainMethods) b[m] = () => b;

    b["insert"] = (payload: unknown) => {
      inserts[table] = [...(inserts[table] ?? []), payload];
      return makeBuilder(table); // new builder so chained .select().single() works
    };
    b["update"] = (payload: unknown) => {
      updates[table] = [...(updates[table] ?? []), payload];
      return makeBuilder(table);
    };
    b["upsert"] = (payload: unknown) => {
      inserts[table] = [...(inserts[table] ?? []), payload];
      return makeBuilder(table);
    };
    b["delete"] = () => makeBuilder(table);

    // Terminal resolvers
    b["single"]      = () => Promise.resolve(dequeue(table));
    b["maybeSingle"] = () => Promise.resolve({ data: null, error: null });

    // Make the builder itself awaitable (for `await supabase.from('t').insert(...)`)
    b["then"] = (
      resolve: (r: MockResponse) => void,
      reject: ((e: unknown) => void) | undefined,
    ) => Promise.resolve(dequeue(table)).then(resolve, reject);

    return b;
  }

  const fromFn = vi.fn((table: string) => makeBuilder(table));

  const client = {
    from: fromFn,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };

  return {
    client,
    /** Queue a custom response for the next terminal call on this table. */
    queueResponse(table: string, response: MockResponse) {
      queues[table] = [...(queues[table] ?? []), response];
    },
    /** All insert payloads captured for a table (in call order). */
    getInserts(table: string): unknown[] {
      return inserts[table] ?? [];
    },
    /** All update payloads captured for a table (in call order). */
    getUpdates(table: string): unknown[] {
      return updates[table] ?? [];
    },
    reset() {
      for (const k of Object.keys(inserts)) delete inserts[k];
      for (const k of Object.keys(updates)) delete updates[k];
      for (const k of Object.keys(queues))  delete queues[k];
      fromFn.mockClear();
    },
  };
}
