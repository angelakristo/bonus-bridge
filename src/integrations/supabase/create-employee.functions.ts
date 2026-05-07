import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLE_ENUM = z.enum(["ceo", "manager", "hr_rep", "employee"]);

const InputSchema = z.object({
  entity_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  position: z.string().nullable(),
  annual_salary: z.number().nullable(),
  employment_start_date: z.string().nullable(),
  roles: z.array(ROLE_ENUM).min(1),
  org_department_id: z.string().uuid(),
  functional_department_ids: z.array(z.string().uuid()),
});

export type CreateEmployeeResult =
  | { ok: true; person_id: string }
  | { ok: false; error: string };

export const createEmployeeManually = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { __invalid: true, message: msg } as never;
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<CreateEmployeeResult> => {
    if ((data as unknown as { __invalid?: boolean }).__invalid) {
      return { ok: false, error: (data as unknown as { message: string }).message };
    }

    const {
      entity_id,
      first_name,
      last_name,
      email,
      position,
      annual_salary,
      employment_start_date,
      roles,
      org_department_id,
      functional_department_ids,
    } = data;

    // 1. Insert person
    const { data: personData, error: personErr } = await supabaseAdmin
      .from("people")
      .insert({
        entity_id,
        first_name,
        last_name,
        email,
        position,
        annual_salary,
        employment_start_date,
        is_active: true,
      })
      .select("id")
      .single();

    if (personErr || !personData) {
      return { ok: false, error: `Failed to create person: ${personErr?.message ?? "unknown"}` };
    }

    const person_id = personData.id;

    // 2. Assign roles
    const { error: rolesErr } = await supabaseAdmin
      .from("people_roles")
      .insert(roles.map((role) => ({ person_id, role })));

    if (rolesErr) {
      await supabaseAdmin.from("people").delete().eq("id", person_id);
      return { ok: false, error: `Failed to assign roles: ${rolesErr.message}` };
    }

    // 3. Assign department
    const { error: orgErr } = await supabaseAdmin
      .from("people_org_departments")
      .insert({ person_id, org_department_id });

    if (orgErr) {
      await supabaseAdmin.from("people_roles").delete().eq("person_id", person_id);
      await supabaseAdmin.from("people").delete().eq("id", person_id);
      return { ok: false, error: `Failed to assign department: ${orgErr.message}` };
    }

    // 4. Assign functions (non-fatal)
    if (functional_department_ids.length > 0) {
      await supabaseAdmin
        .from("people_functional_departments")
        .insert(
          functional_department_ids.map((functional_department_id) => ({
            person_id,
            functional_department_id,
          })),
        );
    }

    return { ok: true, person_id };
  });
