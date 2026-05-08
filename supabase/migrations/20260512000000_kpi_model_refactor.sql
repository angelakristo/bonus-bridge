-- =============================================================================
-- KPI Model Refactor
-- Adds three calculation-model fields to kpi_definitions:
--   period_agg_type  — how Q1/Q2/H1/Q3/Q4/H2/FY mathematically relate
--   scoring_type     — how actual vs target is judged
--   input_mode       — how the user enters data
--
-- Also renames the legacy `halfyear` period value to `h1` across all tables
-- (the UI has always shown "H1"; the seed used "halfyear" as an alias).
-- =============================================================================

-- ── 1. New enums ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.period_aggregation_type AS ENUM (
    'additive_flow',      -- Q1+Q2=H1, H1+H2=FY  (revenue, headcount, cost)
    'snapshot_stock',     -- each period independent; H1=state at mid-year  (rates, scores, balances)
    'weighted_average',   -- H1=avg(Q1,Q2); FY=avg(all quarters)
    'ratio',              -- numerator÷denominator per period (win-rate, margin %)
    'derived_formula',    -- custom expression; aggregates not auto-computable
    'milestone_state',    -- yes/no reached by period-end  (binary training, go-live)
    'composite_index'     -- weighted blend of sub-measures
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scoring_type AS ENUM (
    'higher_is_better',   -- achievement = actual ÷ target × 100
    'lower_is_better',    -- achievement = target ÷ actual × 100  (cost, churn)
    'target_range',       -- 100% if within [min,max]; scales outside
    'threshold_tiered',   -- score jumps at defined thresholds
    'binary'              -- 100% if achieved, 0% if not
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_input_mode AS ENUM (
    'periodic',              -- enter Q1..Q4; H1/H2/FY derived
    'cumulative_to_date',    -- each period value is YTD running total
    'period_end_snapshot',   -- enter value at end of each period; all independent
    'component_based',       -- enter numerator + denominator separately
    'manual_aggregate'       -- enter any period freely; no auto-derivation
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. New columns on kpi_definitions ─────────────────────────────────────────

ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS period_agg_type public.period_aggregation_type,
  ADD COLUMN IF NOT EXISTS scoring_type    public.scoring_type,
  ADD COLUMN IF NOT EXISTS input_mode      public.kpi_input_mode;

-- ── 3. Back-fill from legacy kpi_type ─────────────────────────────────────────
-- progressive → additive_flow  + higher_is_better + periodic
-- benchmark   → snapshot_stock + higher_is_better + period_end_snapshot
-- binary      → milestone_state + binary          + periodic

UPDATE public.kpi_definitions
SET
  period_agg_type = CASE kpi_type
    WHEN 'progressive' THEN 'additive_flow'::public.period_aggregation_type
    WHEN 'benchmark'   THEN 'snapshot_stock'::public.period_aggregation_type
    WHEN 'binary'      THEN 'milestone_state'::public.period_aggregation_type
    ELSE                    'additive_flow'::public.period_aggregation_type
  END,
  scoring_type = CASE kpi_type
    WHEN 'progressive' THEN 'higher_is_better'::public.scoring_type
    WHEN 'benchmark'   THEN 'higher_is_better'::public.scoring_type
    WHEN 'binary'      THEN 'binary'::public.scoring_type
    ELSE                    'higher_is_better'::public.scoring_type
  END,
  input_mode = CASE kpi_type
    WHEN 'progressive' THEN 'periodic'::public.kpi_input_mode
    WHEN 'benchmark'   THEN 'period_end_snapshot'::public.kpi_input_mode
    WHEN 'binary'      THEN 'periodic'::public.kpi_input_mode
    ELSE                    'periodic'::public.kpi_input_mode
  END
WHERE period_agg_type IS NULL;

-- ── 4. Rename halfyear → h1 in all period-bearing tables ──────────────────────
-- The seed used 'halfyear' as the mid-year alias; the UI shows 'H1'.
-- We migrate only rows where h1 doesn't already exist (conflict-safe).

UPDATE public.corporate_kpi_targets
SET period = 'h1'::public.period
WHERE period = 'halfyear'::public.period
  AND NOT EXISTS (
    SELECT 1 FROM public.corporate_kpi_targets t2
    WHERE t2.corporate_kpi_id = corporate_kpi_targets.corporate_kpi_id
      AND t2.period = 'h1'::public.period
  );

UPDATE public.department_kpi_targets
SET period = 'h1'::public.period
WHERE period = 'halfyear'::public.period
  AND NOT EXISTS (
    SELECT 1 FROM public.department_kpi_targets t2
    WHERE t2.department_kpi_id = department_kpi_targets.department_kpi_id
      AND t2.period = 'h1'::public.period
  );

UPDATE public.individual_kpi_targets
SET period = 'h1'::public.period
WHERE period = 'halfyear'::public.period
  AND NOT EXISTS (
    SELECT 1 FROM public.individual_kpi_targets t2
    WHERE t2.individual_kpi_id = individual_kpi_targets.individual_kpi_id
      AND t2.period = 'h1'::public.period
  );

UPDATE public.actuals
SET period = 'h1'::public.period
WHERE period = 'halfyear'::public.period
  AND NOT EXISTS (
    SELECT 1 FROM public.actuals a2
    WHERE a2.entity_id          = actuals.entity_id
      AND a2.kpi_definition_id  = actuals.kpi_definition_id
      AND a2.kpi_level          = actuals.kpi_level
      AND a2.period             = 'h1'::public.period
      AND (
        (a2.person_id IS NULL AND actuals.person_id IS NULL) OR
        a2.person_id = actuals.person_id
      )
  );

-- ── 5. RLS: allow entity members to read new columns (no new policies needed ──
--    The existing SELECT policies on kpi_definitions already cover all columns.

-- ── 6. Recreate v_kpi_actuals_with_targets with scoring_type-aware achievement ─
--    Now joins to kpi_definitions.scoring_type and uses it in the CASE.

DROP VIEW IF EXISTS public.v_kpi_actuals_with_targets;

CREATE VIEW public.v_kpi_actuals_with_targets AS

-- ─── Corporate ────────────────────────────────────────────────────────────────
SELECT
  a.id                          AS actual_id,
  a.entity_id,
  a.kpi_definition_id,
  a.kpi_level,
  a.period,
  a.person_id,
  a.actual_value,
  a.actual_binary,
  a.uploaded_at,
  kd.title                      AS kpi_title,
  kd.kpi_type,
  kd.driver,
  kd.unit,
  kd.period_agg_type,
  kd.scoring_type,
  kd.input_mode,
  ck.year,
  ckt.target_value              AS corporate_target_value,
  ckt.target_binary             AS corporate_target_binary,
  CASE kd.scoring_type
    WHEN 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN 'higher_is_better' THEN
      CASE WHEN ckt.target_value IS NOT NULL AND ckt.target_value <> 0
        THEN ROUND((a.actual_value::numeric / ckt.target_value::numeric) * 100, 2)
        ELSE NULL END
    WHEN 'lower_is_better' THEN
      CASE WHEN a.actual_value IS NOT NULL AND a.actual_value <> 0
        THEN ROUND((ckt.target_value::numeric / a.actual_value::numeric) * 100, 2)
        ELSE NULL END
    ELSE
      -- fallback: kpi_type-based for legacy rows without scoring_type
      CASE
        WHEN kd.kpi_type = 'binary' THEN
          CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
        WHEN ckt.target_value IS NOT NULL AND ckt.target_value <> 0 THEN
          ROUND((a.actual_value::numeric / ckt.target_value::numeric) * 100, 2)
        ELSE NULL
      END
  END                           AS achievement_pct
FROM  public.actuals a
JOIN  public.kpi_definitions kd  ON  kd.id = a.kpi_definition_id
JOIN  public.corporate_kpis ck
        ON  ck.entity_id         = a.entity_id
        AND ck.kpi_definition_id = a.kpi_definition_id
LEFT JOIN public.corporate_kpi_targets ckt
        ON  ckt.corporate_kpi_id = ck.id
        AND ckt.period           = a.period
WHERE a.kpi_level = 'corporate'

UNION ALL

-- ─── Department ───────────────────────────────────────────────────────────────
SELECT
  a.id,
  a.entity_id,
  a.kpi_definition_id,
  a.kpi_level,
  a.period,
  a.person_id,
  a.actual_value,
  a.actual_binary,
  a.uploaded_at,
  kd.title,
  kd.kpi_type,
  kd.driver,
  kd.unit,
  kd.period_agg_type,
  kd.scoring_type,
  kd.input_mode,
  dk.year,
  dkt.target_value,
  dkt.target_binary,
  CASE kd.scoring_type
    WHEN 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN 'higher_is_better' THEN
      CASE WHEN dkt.target_value IS NOT NULL AND dkt.target_value <> 0
        THEN ROUND((a.actual_value::numeric / dkt.target_value::numeric) * 100, 2)
        ELSE NULL END
    WHEN 'lower_is_better' THEN
      CASE WHEN a.actual_value IS NOT NULL AND a.actual_value <> 0
        THEN ROUND((dkt.target_value::numeric / a.actual_value::numeric) * 100, 2)
        ELSE NULL END
    ELSE
      CASE
        WHEN kd.kpi_type = 'binary' THEN
          CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
        WHEN dkt.target_value IS NOT NULL AND dkt.target_value <> 0 THEN
          ROUND((a.actual_value::numeric / dkt.target_value::numeric) * 100, 2)
        ELSE NULL
      END
  END
FROM  public.actuals a
JOIN  public.kpi_definitions kd  ON  kd.id = a.kpi_definition_id
JOIN  public.department_kpis dk
        ON  dk.entity_id         = a.entity_id
        AND dk.kpi_definition_id = a.kpi_definition_id
LEFT JOIN public.department_kpi_targets dkt
        ON  dkt.department_kpi_id = dk.id
        AND dkt.period            = a.period
WHERE a.kpi_level = 'department'

UNION ALL

-- ─── Individual ───────────────────────────────────────────────────────────────
SELECT
  a.id,
  a.entity_id,
  a.kpi_definition_id,
  a.kpi_level,
  a.period,
  a.person_id,
  a.actual_value,
  a.actual_binary,
  a.uploaded_at,
  kd.title,
  kd.kpi_type,
  kd.driver,
  kd.unit,
  kd.period_agg_type,
  kd.scoring_type,
  kd.input_mode,
  ik.year,
  ikt.target_value,
  ikt.target_binary,
  CASE kd.scoring_type
    WHEN 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN 'higher_is_better' THEN
      CASE WHEN ikt.target_value IS NOT NULL AND ikt.target_value <> 0
        THEN ROUND((a.actual_value::numeric / ikt.target_value::numeric) * 100, 2)
        ELSE NULL END
    WHEN 'lower_is_better' THEN
      CASE WHEN a.actual_value IS NOT NULL AND a.actual_value <> 0
        THEN ROUND((ikt.target_value::numeric / a.actual_value::numeric) * 100, 2)
        ELSE NULL END
    ELSE
      CASE
        WHEN kd.kpi_type = 'binary' THEN
          CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
        WHEN ikt.target_value IS NOT NULL AND ikt.target_value <> 0 THEN
          ROUND((a.actual_value::numeric / ikt.target_value::numeric) * 100, 2)
        ELSE NULL
      END
  END
FROM  public.actuals a
JOIN  public.kpi_definitions kd  ON  kd.id = a.kpi_definition_id
JOIN  public.individual_kpis ik
        ON  ik.entity_id         = a.entity_id
        AND ik.kpi_definition_id = a.kpi_definition_id
        AND ik.person_id         = a.person_id
LEFT JOIN public.individual_kpi_targets ikt
        ON  ikt.individual_kpi_id = ik.id
        AND ikt.period            = a.period
WHERE a.kpi_level = 'individual';

-- Grant read access (mirrors existing view grants)
GRANT SELECT ON public.v_kpi_actuals_with_targets TO authenticated;
