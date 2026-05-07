-- Migration: clean up legacy function names in the `functions` table
-- Handles both "Name/Other" and "Name / Other" (with spaces) spellings.

-- 1. Finance / Accounting → Accounting
UPDATE public.functions
SET name = 'Accounting'
WHERE TRIM(name) IN ('Finance/Accounting', 'Finance / Accounting');

-- 2. Sales / Marketing → Marketing
UPDATE public.functions
SET name = 'Marketing'
WHERE TRIM(name) IN ('Sales/Marketing', 'Sales / Marketing');

-- 3. Risk / Compliance → Risk (Compliance already exists as a separate row)
--    If Compliance doesn't exist yet, rename the row; otherwise rename to Risk.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.functions WHERE TRIM(name) = 'Compliance') THEN
    -- Compliance already exists — just rename the slash-variant to Risk
    UPDATE public.functions
    SET name = 'Risk'
    WHERE TRIM(name) IN ('Risk/Compliance', 'Risk / Compliance');
  ELSE
    -- Compliance doesn't exist — rename slash-variant to Risk and insert Compliance
    UPDATE public.functions
    SET name = 'Risk'
    WHERE TRIM(name) IN ('Risk/Compliance', 'Risk / Compliance');

    INSERT INTO public.functions (name)
    VALUES ('Compliance')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 4. Ensure "Finance" exists as a standalone function
INSERT INTO public.functions (name)
VALUES ('Finance')
ON CONFLICT DO NOTHING;
