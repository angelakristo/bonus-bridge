-- Direct assignment RLS patch.
-- Replaces the broad entity-member insert policy on individual_kpis with one that
-- restricts 'approved' status inserts to CEO and HR Rep only.
-- Safe to apply on top of 20260427000000_complete_rls_policies.sql.

DROP POLICY IF EXISTS "entity_members_can_insert_individual_kpis" ON public.individual_kpis;
CREATE POLICY "entity_members_can_insert_individual_kpis"
ON public.individual_kpis FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    -- CEO and HR Rep may insert with any status, including 'approved' (direct assignment)
    'ceo'::public.user_role    = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
    -- All other roles (manager, employee) may only insert non-approved statuses
    OR status != 'approved'::public.kpi_status
  )
);
