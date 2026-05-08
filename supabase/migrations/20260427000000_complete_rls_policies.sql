-- Complete RLS policy set.
-- Uses DROP POLICY IF EXISTS before every CREATE so this file is safe to run
-- whether or not the earlier migration (20260425000000) was already applied.
-- Run this in the Supabase SQL Editor (or via `supabase db push`).

-- ─────────────────────────────────────────────
-- kpi_definitions
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_kpi_definitions" ON public.kpi_definitions;
CREATE POLICY "entity_members_can_read_kpi_definitions"
ON public.kpi_definitions FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "entity_members_can_insert_kpi_definitions" ON public.kpi_definitions;
CREATE POLICY "entity_members_can_insert_kpi_definitions"
ON public.kpi_definitions FOR INSERT TO authenticated
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- corporate_kpis
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_corporate_kpis" ON public.corporate_kpis;
CREATE POLICY "entity_members_can_read_corporate_kpis"
ON public.corporate_kpis FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_or_manager_can_insert_corporate_kpis" ON public.corporate_kpis;
CREATE POLICY "ceo_or_manager_can_insert_corporate_kpis"
ON public.corporate_kpis FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'manager'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_manager_can_update_corporate_kpis" ON public.corporate_kpis;
CREATE POLICY "ceo_or_manager_can_update_corporate_kpis"
ON public.corporate_kpis FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- corporate_kpi_targets
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_corporate_kpi_targets" ON public.corporate_kpi_targets;
CREATE POLICY "entity_members_can_read_corporate_kpi_targets"
ON public.corporate_kpi_targets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.corporate_kpis ck
    WHERE ck.id = corporate_kpi_id AND ck.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "entity_members_can_insert_corporate_kpi_targets" ON public.corporate_kpi_targets;
CREATE POLICY "entity_members_can_insert_corporate_kpi_targets"
ON public.corporate_kpi_targets FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.corporate_kpis ck
    WHERE ck.id = corporate_kpi_id AND ck.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- department_kpis
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_department_kpis" ON public.department_kpis;
CREATE POLICY "entity_members_can_read_department_kpis"
ON public.department_kpis FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "entity_members_can_insert_department_kpis" ON public.department_kpis;
CREATE POLICY "entity_members_can_insert_department_kpis"
ON public.department_kpis FOR INSERT TO authenticated
WITH CHECK (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "entity_members_can_update_department_kpis" ON public.department_kpis;
CREATE POLICY "entity_members_can_update_department_kpis"
ON public.department_kpis FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- department_kpi_targets
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_department_kpi_targets" ON public.department_kpi_targets;
CREATE POLICY "entity_members_can_read_department_kpi_targets"
ON public.department_kpi_targets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.department_kpis dk
    WHERE dk.id = department_kpi_id AND dk.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "entity_members_can_insert_department_kpi_targets" ON public.department_kpi_targets;
CREATE POLICY "entity_members_can_insert_department_kpi_targets"
ON public.department_kpi_targets FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.department_kpis dk
    WHERE dk.id = department_kpi_id AND dk.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- individual_kpis
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_individual_kpis" ON public.individual_kpis;
CREATE POLICY "entity_members_can_read_individual_kpis"
ON public.individual_kpis FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

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

DROP POLICY IF EXISTS "entity_members_can_update_individual_kpis" ON public.individual_kpis;
CREATE POLICY "entity_members_can_update_individual_kpis"
ON public.individual_kpis FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- individual_kpi_targets
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_individual_kpi_targets" ON public.individual_kpi_targets;
CREATE POLICY "entity_members_can_read_individual_kpi_targets"
ON public.individual_kpi_targets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.individual_kpis ik
    WHERE ik.id = individual_kpi_id AND ik.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "entity_members_can_insert_individual_kpi_targets" ON public.individual_kpi_targets;
CREATE POLICY "entity_members_can_insert_individual_kpi_targets"
ON public.individual_kpi_targets FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.individual_kpis ik
    WHERE ik.id = individual_kpi_id AND ik.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "entity_members_can_update_individual_kpi_targets" ON public.individual_kpi_targets;
CREATE POLICY "entity_members_can_update_individual_kpi_targets"
ON public.individual_kpi_targets FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.individual_kpis ik
    WHERE ik.id = individual_kpi_id AND ik.entity_id = public.get_my_entity_id()
  )
);

-- ─────────────────────────────────────────────
-- bonus_schemes
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_bonus_schemes" ON public.bonus_schemes;
CREATE POLICY "entity_members_can_read_bonus_schemes"
ON public.bonus_schemes FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_or_hr_can_insert_bonus_schemes" ON public.bonus_schemes;
CREATE POLICY "ceo_or_hr_can_insert_bonus_schemes"
ON public.bonus_schemes FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_hr_can_update_bonus_schemes" ON public.bonus_schemes;
CREATE POLICY "ceo_or_hr_can_update_bonus_schemes"
ON public.bonus_schemes FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

-- ─────────────────────────────────────────────
-- bonus_scheme_tiers
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_bonus_scheme_tiers" ON public.bonus_scheme_tiers;
CREATE POLICY "entity_members_can_read_bonus_scheme_tiers"
ON public.bonus_scheme_tiers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bonus_schemes bs
    WHERE bs.id = bonus_scheme_id AND bs.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "ceo_can_insert_bonus_scheme_tiers" ON public.bonus_scheme_tiers;
CREATE POLICY "ceo_can_insert_bonus_scheme_tiers"
ON public.bonus_scheme_tiers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bonus_schemes bs
    WHERE bs.id = bonus_scheme_id AND bs.entity_id = public.get_my_entity_id()
  )
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);

DROP POLICY IF EXISTS "ceo_can_delete_bonus_scheme_tiers" ON public.bonus_scheme_tiers;
CREATE POLICY "ceo_can_delete_bonus_scheme_tiers"
ON public.bonus_scheme_tiers FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bonus_schemes bs
    WHERE bs.id = bonus_scheme_id AND bs.entity_id = public.get_my_entity_id()
  )
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);

-- ─────────────────────────────────────────────
-- drivers
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_drivers" ON public.drivers;
CREATE POLICY "entity_members_can_read_drivers"
ON public.drivers FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_can_insert_drivers" ON public.drivers;
CREATE POLICY "ceo_can_insert_drivers"
ON public.drivers FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);

DROP POLICY IF EXISTS "ceo_can_update_drivers" ON public.drivers;
CREATE POLICY "ceo_can_update_drivers"
ON public.drivers FOR UPDATE TO authenticated
USING (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
)
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND 'ceo'::public.user_role = ANY(public.get_my_roles())
);

-- ─────────────────────────────────────────────
-- employee_kpi_group_weights
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_kpi_group_weights" ON public.employee_kpi_group_weights;
CREATE POLICY "entity_members_can_read_kpi_group_weights"
ON public.employee_kpi_group_weights FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_or_manager_can_insert_kpi_group_weights" ON public.employee_kpi_group_weights;
CREATE POLICY "ceo_or_manager_can_insert_kpi_group_weights"
ON public.employee_kpi_group_weights FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'manager'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_manager_can_update_kpi_group_weights" ON public.employee_kpi_group_weights;
CREATE POLICY "ceo_or_manager_can_update_kpi_group_weights"
ON public.employee_kpi_group_weights FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- employee_kpi_item_weights
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_kpi_item_weights" ON public.employee_kpi_item_weights;
CREATE POLICY "entity_members_can_read_kpi_item_weights"
ON public.employee_kpi_item_weights FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_or_manager_can_insert_kpi_item_weights" ON public.employee_kpi_item_weights;
CREATE POLICY "ceo_or_manager_can_insert_kpi_item_weights"
ON public.employee_kpi_item_weights FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'manager'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_manager_can_update_kpi_item_weights" ON public.employee_kpi_item_weights;
CREATE POLICY "ceo_or_manager_can_update_kpi_item_weights"
ON public.employee_kpi_item_weights FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());

-- ─────────────────────────────────────────────
-- people_roles  (no entity_id — scope via people table)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_people_roles" ON public.people_roles;
CREATE POLICY "entity_members_can_read_people_roles"
ON public.people_roles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "ceo_or_hr_can_insert_people_roles" ON public.people_roles;
CREATE POLICY "ceo_or_hr_can_insert_people_roles"
ON public.people_roles FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_hr_can_delete_people_roles" ON public.people_roles;
CREATE POLICY "ceo_or_hr_can_delete_people_roles"
ON public.people_roles FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

-- ─────────────────────────────────────────────
-- people_functional_departments  (no entity_id)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_people_func_depts" ON public.people_functional_departments;
CREATE POLICY "entity_members_can_read_people_func_depts"
ON public.people_functional_departments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
);

DROP POLICY IF EXISTS "ceo_or_hr_can_insert_people_func_depts" ON public.people_functional_departments;
CREATE POLICY "ceo_or_hr_can_insert_people_func_depts"
ON public.people_functional_departments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_hr_can_delete_people_func_depts" ON public.people_functional_departments;
CREATE POLICY "ceo_or_hr_can_delete_people_func_depts"
ON public.people_functional_departments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = person_id AND p.entity_id = public.get_my_entity_id()
  )
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'hr_rep'::public.user_role = ANY(public.get_my_roles())
  )
);

-- ─────────────────────────────────────────────
-- employee_bonus_assignments
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_members_can_read_bonus_assignments" ON public.employee_bonus_assignments;
CREATE POLICY "entity_members_can_read_bonus_assignments"
ON public.employee_bonus_assignments FOR SELECT TO authenticated
USING (entity_id = public.get_my_entity_id());

DROP POLICY IF EXISTS "ceo_or_manager_can_insert_bonus_assignments" ON public.employee_bonus_assignments;
CREATE POLICY "ceo_or_manager_can_insert_bonus_assignments"
ON public.employee_bonus_assignments FOR INSERT TO authenticated
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'ceo'::public.user_role = ANY(public.get_my_roles())
    OR 'manager'::public.user_role = ANY(public.get_my_roles())
  )
);

DROP POLICY IF EXISTS "ceo_or_manager_can_update_bonus_assignments" ON public.employee_bonus_assignments;
CREATE POLICY "ceo_or_manager_can_update_bonus_assignments"
ON public.employee_bonus_assignments FOR UPDATE TO authenticated
USING (entity_id = public.get_my_entity_id())
WITH CHECK (entity_id = public.get_my_entity_id());
