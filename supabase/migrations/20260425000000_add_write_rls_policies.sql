-- RLS write policies for tables that are missing them.
-- All policies use the existing helper functions get_my_entity_id() and get_my_roles().

-- ─────────────────────────────────────────────
-- individual_kpis
-- ─────────────────────────────────────────────
CREATE POLICY "entity_members_can_insert_individual_kpis"
ON public.individual_kpis
FOR INSERT
TO authenticated
WITH CHECK (entity_id = public.get_my_entity_id());

CREATE POLICY "entity_members_can_update_individual_kpis"
ON public.individual_kpis
FOR UPDATE
TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- individual_kpi_targets
-- ─────────────────────────────────────────────
CREATE POLICY "entity_members_can_insert_individual_kpi_targets"
ON public.individual_kpi_targets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.individual_kpis ik
    WHERE ik.id = individual_kpi_id
      AND ik.entity_id = public.get_my_entity_id()
  )
);

CREATE POLICY "entity_members_can_update_individual_kpi_targets"
ON public.individual_kpi_targets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.individual_kpis ik
    WHERE ik.id = individual_kpi_id
      AND ik.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- corporate_kpis
-- ─────────────────────────────────────────────
CREATE POLICY "ceo_or_manager_can_insert_corporate_kpis"
ON public.corporate_kpis
FOR INSERT
TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'manager'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

CREATE POLICY "ceo_or_manager_can_update_corporate_kpis"
ON public.corporate_kpis
FOR UPDATE
TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- corporate_kpi_targets
-- ─────────────────────────────────────────────
CREATE POLICY "entity_members_can_insert_corporate_kpi_targets"
ON public.corporate_kpi_targets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.corporate_kpis ck
    WHERE ck.id = corporate_kpi_id
      AND ck.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- department_kpis
-- ─────────────────────────────────────────────
CREATE POLICY "entity_members_can_insert_department_kpis"
ON public.department_kpis
FOR INSERT
TO authenticated
WITH CHECK (entity_id = public.get_my_entity_id());

CREATE POLICY "entity_members_can_update_department_kpis"
ON public.department_kpis
FOR UPDATE
TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- department_kpi_targets
-- ─────────────────────────────────────────────
CREATE POLICY "entity_members_can_insert_department_kpi_targets"
ON public.department_kpi_targets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.department_kpis dk
    WHERE dk.id = department_kpi_id
      AND dk.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- bonus_schemes
-- ─────────────────────────────────────────────
CREATE POLICY "ceo_or_hr_can_insert_bonus_schemes"
ON public.bonus_schemes
FOR INSERT
TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

CREATE POLICY "ceo_or_hr_can_update_bonus_schemes"
ON public.bonus_schemes
FOR UPDATE
TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

-- ─────────────────────────────────────────────
-- drivers
-- ─────────────────────────────────────────────
CREATE POLICY "ceo_can_insert_drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);

CREATE POLICY "ceo_can_update_drivers"
ON public.drivers
FOR UPDATE
TO authenticated
USING (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
)
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);
