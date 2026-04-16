-- Enum for setup step status
CREATE TYPE public.setup_step_status AS ENUM ('not_started', 'in_progress', 'complete');

-- Per-entity progress for each setup step (one row per entity+step_key)
CREATE TABLE public.setup_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL,
  step_key TEXT NOT NULL,
  status public.setup_step_status NOT NULL DEFAULT 'not_started',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (entity_id, step_key)
);

ALTER TABLE public.setup_progress ENABLE ROW LEVEL SECURITY;

-- Only members of the entity (CEO or HR Rep) can read or write their entity's setup progress
CREATE POLICY setup_progress_entity_read
  ON public.setup_progress
  FOR SELECT
  USING (entity_id = public.get_my_entity_id());

CREATE POLICY setup_progress_entity_write
  ON public.setup_progress
  FOR INSERT
  WITH CHECK (
    entity_id = public.get_my_entity_id()
    AND ('ceo' = ANY(public.get_my_roles()) OR 'hr_rep' = ANY(public.get_my_roles()))
  );

CREATE POLICY setup_progress_entity_update
  ON public.setup_progress
  FOR UPDATE
  USING (
    entity_id = public.get_my_entity_id()
    AND ('ceo' = ANY(public.get_my_roles()) OR 'hr_rep' = ANY(public.get_my_roles()))
  );

CREATE INDEX idx_setup_progress_entity ON public.setup_progress(entity_id);