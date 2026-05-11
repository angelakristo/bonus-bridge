-- =============================================================================
-- Add department_kpi_id to individual_kpis
--
-- Creates a direct FK from individual KPIs to the department KPI they support,
-- replacing the fragile "Aligns to dept KPI: <title>." description-prefix hack.
--
-- ON DELETE SET NULL: removing a dept KPI orphans individual KPIs gracefully.
-- =============================================================================

ALTER TABLE public.individual_kpis
  ADD COLUMN IF NOT EXISTS department_kpi_id UUID
    REFERENCES public.department_kpis(id) ON DELETE SET NULL;

-- ── Index for lookups: "which individual KPIs reference this dept KPI?" ──────
CREATE INDEX IF NOT EXISTS idx_individual_kpis_department_kpi_id
  ON public.individual_kpis(department_kpi_id)
  WHERE department_kpi_id IS NOT NULL;

-- ── Composite index for the common query pattern ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_individual_kpis_entity_dept_kpi
  ON public.individual_kpis(entity_id, department_kpi_id)
  WHERE department_kpi_id IS NOT NULL;

-- ── Backfill: match on kpi_definition_id within the same org department ───────
-- Finds individual KPIs where the person belongs to the same org department
-- as a department KPI with the same kpi_definition_id.
UPDATE public.individual_kpis i
SET department_kpi_id = dk.id
FROM public.department_kpis dk
WHERE i.entity_id        = dk.entity_id
  AND i.kpi_definition_id = dk.kpi_definition_id
  AND i.department_kpi_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.people_org_departments pod
    WHERE pod.person_id        = i.person_id
      AND pod.org_department_id = dk.org_department_id
  );

-- ── Notify PostgREST to reload schema cache ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
