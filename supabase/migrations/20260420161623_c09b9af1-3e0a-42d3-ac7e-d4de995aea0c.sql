-- Allow hr_rep and ceo within the same entity to update departments
CREATE POLICY "hr_rep_or_ceo_can_update_departments"
ON public.organisational_departments
FOR UPDATE
TO authenticated
USING (
  entity_id = public.get_my_entity_id()
  AND (
    'hr_rep'::public.user_role = ANY (public.get_my_roles())
    OR 'ceo'::public.user_role = ANY (public.get_my_roles())
  )
)
WITH CHECK (
  entity_id = public.get_my_entity_id()
  AND (
    'hr_rep'::public.user_role = ANY (public.get_my_roles())
    OR 'ceo'::public.user_role = ANY (public.get_my_roles())
  )
);

-- Allow hr_rep and ceo within the same entity to delete departments
CREATE POLICY "hr_rep_or_ceo_can_delete_departments"
ON public.organisational_departments
FOR DELETE
TO authenticated
USING (
  entity_id = public.get_my_entity_id()
  AND (
    'hr_rep'::public.user_role = ANY (public.get_my_roles())
    OR 'ceo'::public.user_role = ANY (public.get_my_roles())
  )
);