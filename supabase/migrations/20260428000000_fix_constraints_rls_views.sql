-- Fix 1: UNIQUE indexes required for UPSERT onConflict on weighting tables
CREATE UNIQUE INDEX IF NOT EXISTS employee_kpi_group_weights_person_entity_year_idx
  ON public.employee_kpi_group_weights (person_id, entity_id, year);

CREATE UNIQUE INDEX IF NOT EXISTS employee_kpi_item_weights_composite_idx
  ON public.employee_kpi_item_weights (person_id, entity_id, year, kpi_level, kpi_assignment_id);

-- Fix 5: RLS SELECT policy for functional_departments (global reference data, no entity_id column)
DROP POLICY IF EXISTS "authenticated_can_read_functional_departments" ON public.functional_departments;
CREATE POLICY "authenticated_can_read_functional_departments"
ON public.functional_departments FOR SELECT TO authenticated
USING (true);

-- Fix 4/6/7: RLS for actuals — needed for v_kpi_actuals_with_targets view to return rows
DROP POLICY IF EXISTS "entity_members_can_read_actuals" ON public.actuals;
CREATE POLICY "entity_members_can_read_actuals"
ON public.actuals FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "hr_rep_can_insert_actuals" ON public.actuals;
CREATE POLICY "hr_rep_can_insert_actuals"
ON public.actuals FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'hr_rep'::public.user_role = ANY(public.get_my_roles())
);

DROP POLICY IF EXISTS "hr_rep_can_update_actuals" ON public.actuals;
CREATE POLICY "hr_rep_can_update_actuals"
ON public.actuals FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'hr_rep'::public.user_role = ANY(public.get_my_roles())
);

-- Fix 4/6/7: Recreate v_kpi_actuals_with_targets adding the year column.
-- CREATE OR REPLACE VIEW cannot change column order, so we DROP first.
-- The view derives year from the KPI assignment tables (corporate_kpis /
-- department_kpis / individual_kpis), each of which carries a year column.
-- Uses UNION ALL split by kpi_level so each arm can join to the correct
-- assignment + target tables without cross-level ambiguity.
DROP VIEW IF EXISTS public.v_kpi_actuals_with_targets;
CREATE VIEW public.v_kpi_actuals_with_targets AS

-- ─── Corporate ───────────────────────────────────────────────────────────────
SELECT
  a.id                        AS actual_id,
  a.entity_id,
  a.kpi_definition_id,
  a.kpi_level,
  a.period,
  a.person_id,
  a.actual_value,
  a.actual_binary,
  a.uploaded_at,
  kd.title                    AS kpi_title,
  kd.kpi_type,
  kd.driver,
  kd.unit,
  ck.year,
  ckt.target_value            AS corporate_target_value,
  ckt.target_binary           AS corporate_target_binary,
  CASE
    WHEN kd.kpi_type = 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN ckt.target_value IS NOT NULL AND ckt.target_value <> 0 THEN
      ROUND((a.actual_value::numeric / ckt.target_value::numeric) * 100, 2)
    ELSE NULL
  END                         AS achievement_pct
FROM  public.actuals a
JOIN  public.kpi_definitions kd
        ON  kd.id = a.kpi_definition_id
JOIN  public.corporate_kpis ck
        ON  ck.entity_id         = a.entity_id
        AND ck.kpi_definition_id = a.kpi_definition_id
LEFT JOIN public.corporate_kpi_targets ckt
        ON  ckt.corporate_kpi_id = ck.id
        AND ckt.period           = a.period
WHERE a.kpi_level = 'corporate'

UNION ALL

-- ─── Department ──────────────────────────────────────────────────────────────
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
  dk.year,
  dkt.target_value,
  dkt.target_binary,
  CASE
    WHEN kd.kpi_type = 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN dkt.target_value IS NOT NULL AND dkt.target_value <> 0 THEN
      ROUND((a.actual_value::numeric / dkt.target_value::numeric) * 100, 2)
    ELSE NULL
  END
FROM  public.actuals a
JOIN  public.kpi_definitions kd
        ON  kd.id = a.kpi_definition_id
JOIN  public.department_kpis dk
        ON  dk.entity_id         = a.entity_id
        AND dk.kpi_definition_id = a.kpi_definition_id
LEFT JOIN public.department_kpi_targets dkt
        ON  dkt.department_kpi_id = dk.id
        AND dkt.period            = a.period
WHERE a.kpi_level = 'department'

UNION ALL

-- ─── Individual ──────────────────────────────────────────────────────────────
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
  ik.year,
  ikt.target_value,
  ikt.target_binary,
  CASE
    WHEN kd.kpi_type = 'binary' THEN
      CASE WHEN a.actual_binary IS TRUE THEN 100.0 ELSE 0.0 END
    WHEN ikt.target_value IS NOT NULL AND ikt.target_value <> 0 THEN
      ROUND((a.actual_value::numeric / ikt.target_value::numeric) * 100, 2)
    ELSE NULL
  END
FROM  public.actuals a
JOIN  public.kpi_definitions kd
        ON  kd.id = a.kpi_definition_id
JOIN  public.individual_kpis ik
        ON  ik.entity_id         = a.entity_id
        AND ik.kpi_definition_id = a.kpi_definition_id
        AND ik.person_id         = a.person_id
LEFT JOIN public.individual_kpi_targets ikt
        ON  ikt.individual_kpi_id = ik.id
        AND ikt.period            = a.period
WHERE a.kpi_level = 'individual';
