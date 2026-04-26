import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleEnum = z.enum(["ceo", "manager", "hr_rep", "employee"]);

const InputSchema = z.object({
  person_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  roles: z.array(RoleEnum).min(1),
  functional_department_id: z.string().uuid().nullable(),
});

export type UpdatePersonRolesResult = {
  ok: boolean;
  roles?: z.infer<typeof RoleEnum>[];
  error?: string;
};

export const updatePersonRoles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<UpdatePersonRolesResult> => {
    const { person_id, entity_id, roles, functional_department_id } = data;

    // 1. Verify person belongs to entity
    const personRes = await supabaseAdmin
      .from("people")
      .select("id")
      .eq("id", person_id)
      .eq("entity_id", entity_id)
      .maybeSingle();

    if (personRes.error || !personRes.data) {
      return { ok: false, error: "Person not found in this entity." };
    }

    // 2. Fetch current roles
    const currentRes = await supabaseAdmin
      .from("people_roles")
      .select("role")
      .eq("person_id", person_id);

    if (currentRes.error) {
      return { ok: false, error: `Failed to load existing roles: ${currentRes.error.message}` };
    }

    const existing = new Set((currentRes.data ?? []).map((r) => r.role));
    const next = new Set(roles);

    const toAdd = roles.filter((r) => !existing.has(r));
    const toRemove = Array.from(existing).filter((r) => !next.has(r));

    if (toAdd.length > 0) {
      const insertRes = await supabaseAdmin
        .from("people_roles")
        .insert(toAdd.map((role) => ({ person_id, role })));
      if (insertRes.error) {
        return { ok: false, error: `Failed to add roles: ${insertRes.error.message}` };
      }
    }

    if (toRemove.length > 0) {
      const deleteRes = await supabaseAdmin
        .from("people_roles")
        .delete()
        .eq("person_id", person_id)
        .in("role", toRemove);
      if (deleteRes.error) {
        return { ok: false, error: `Failed to remove roles: ${deleteRes.error.message}` };
      }
    }

    // 3. Sync functional department (single assignment per person)
    const delFuncRes = await supabaseAdmin
      .from("people_functional_departments")
      .delete()
      .eq("person_id", person_id);
    if (delFuncRes.error) {
      return {
        ok: false,
        error: `Failed to clear functional department: ${delFuncRes.error.message}`,
      };
    }

    if (functional_department_id) {
      const insFuncRes = await supabaseAdmin
        .from("people_functional_departments")
        .insert({ person_id, functional_department_id });
      if (insFuncRes.error) {
        return {
          ok: false,
          error: `Failed to set functional department: ${insFuncRes.error.message}`,
        };
      }
    }

    // 4. Re-assert at least one role remains
    const finalRes = await supabaseAdmin
      .from("people_roles")
      .select("role")
      .eq("person_id", person_id);

    if (finalRes.error) {
      return { ok: false, error: `Failed to verify roles: ${finalRes.error.message}` };
    }

    const finalRoles = (finalRes.data ?? []).map((r) => r.role) as z.infer<typeof RoleEnum>[];

    if (finalRoles.length === 0) {
      return { ok: false, error: "A person must have at least one role" };
    }

    return { ok: true, roles: finalRoles };
  });
