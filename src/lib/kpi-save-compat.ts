/**
 * Utilities for gracefully handling the kpi_definitions schema migration.
 *
 * Migration: 20260512000000_kpi_model_refactor.sql
 * Adds three columns: period_agg_type, scoring_type, input_mode
 *
 * When the migration has not been applied (or PostgREST's schema cache hasn't
 * refreshed), Supabase returns a specific "column not in schema cache" error.
 * This module detects that error and provides a fallback so saves don't fail
 * completely during rollout.
 *
 * Fallback behaviour: retry the kpi_definitions write without the three new
 * fields (writing only the legacy kpi_type). A warning toast is shown so the
 * user knows to apply the migration.
 */

export const MIGRATION_NAME = "20260512000000_kpi_model_refactor.sql";

export const MIGRATION_HINT =
  `Apply migration "${MIGRATION_NAME}" in Supabase Dashboard → Database → Migrations, ` +
  `then refresh the schema cache with: NOTIFY pgrst, 'reload schema'`;

// PostgREST error pattern for a column missing from the schema cache.
// Matches messages like:
//   "Could not find the 'input_mode' column of 'kpi_definitions' in the schema cache"
const SCHEMA_CACHE_RE =
  /could not find the '(period_agg_type|scoring_type|input_mode)' column/i;

/**
 * Returns true when the Supabase error message indicates that one of the three
 * new calculation-model columns is missing from PostgREST's schema cache — i.e.
 * the migration has not been applied or the cache has not been refreshed.
 */
export function isCalcModelSchemaMissing(errorMsg: string): boolean {
  return SCHEMA_CACHE_RE.test(errorMsg);
}

export type CalcModelFields = {
  period_agg_type: string;
  scoring_type: string;
  input_mode: string;
};

/**
 * Strip the three new calculation-model fields from a payload object.
 * Used to build a legacy-compatible fallback payload when the migration
 * has not yet been applied.
 */
export function omitCalcModelFields<T extends Partial<CalcModelFields>>(
  record: T,
): Omit<T, keyof CalcModelFields> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { period_agg_type: _a, scoring_type: _s, input_mode: _i, ...rest } = record;
  return rest as Omit<T, keyof CalcModelFields>;
}
