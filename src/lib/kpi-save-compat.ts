
export const MIGRATION_NAME = "20260512000000_kpi_model_refactor.sql";

export const MIGRATION_HINT =
  `Apply migration "${MIGRATION_NAME}" in Supabase Dashboard → Database → Migrations, ` +
  `then refresh the schema cache with: NOTIFY pgrst, 'reload schema'`;

const SCHEMA_CACHE_RE =
  /could not find the '(period_agg_type|scoring_type|input_mode)' column/i;

export function isCalcModelSchemaMissing(errorMsg: string): boolean {
  return SCHEMA_CACHE_RE.test(errorMsg);
}

export type CalcModelFields = {
  period_agg_type: string;
  scoring_type: string;
  input_mode: string;
};

export function omitCalcModelFields<T extends Partial<CalcModelFields>>(
  record: T,
): Omit<T, keyof CalcModelFields> {
  const { period_agg_type: _a, scoring_type: _s, input_mode: _i, ...rest } = record;
  return rest as Omit<T, keyof CalcModelFields>;
}
