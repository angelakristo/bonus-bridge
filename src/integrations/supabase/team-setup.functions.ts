import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLE_ENUM = z.enum(["ceo", "manager", "hr_rep", "employee"]);

const EditRowSchema = z.object({
  person_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  position: z.string().nullable(),
  annual_salary: z.number().nullable(),
  employment_start_date: z.string().nullable(),
  roles: z.array(ROLE_ENUM).min(1),
  org_department_id: z.string().uuid().nullable(),
  functional_department_ids: z.array(z.string().uuid()),
});

const InputSchema = z.object({
  edits: z.array(EditRowSchema).min(1),
});

export type CommitTeamSetupEditsResult = {
  updated: number;
  errors: { person_id: string; message: string }[];
};

export const commitTeamSetupEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      return { __invalid: true, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } as never;
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<CommitTeamSetupEditsResult> => {
    try {
      if ((data as unknown as { __invalid?: boolean }).__invalid) {
        return {
          updated: 0,
          errors: [{ person_id: "", message: (data as unknown as { message: string }).message }],
        };
      }

      const { edits } = data;
      let updated = 0;
      const errors: { person_id: string; message: string }[] = [];

      for (const edit of edits) {
        try {
          // 1. Update people row
          const updateRes = await supabaseAdmin
            .from("people")
            .update({
              first_name: edit.first_name,
              last_name: edit.last_name,
              email: edit.email,
              position: edit.position,
              annual_salary: edit.annual_salary,
              employment_start_date: edit.employment_start_date,
            })
            .eq("id", edit.person_id);

          if (updateRes.error) {
            errors.push({ person_id: edit.person_id, message: `People update failed: ${updateRes.error.message}` });
            continue;
          }

          // 2. Sync roles: fetch existing, compute diff
          const { data: existingRoles, error: rolesErr } = await supabaseAdmin
            .from("people_roles")
            .select("role")
            .eq("person_id", edit.person_id);

          if (rolesErr) {
            errors.push({ person_id: edit.person_id, message: `Roles fetch failed: ${rolesErr.message}` });
            continue;
          }

          const existingSet = new Set((existingRoles ?? []).map((r) => r.role));
          const nextSet = new Set(edit.roles);
          const toAdd = edit.roles.filter((r) => !existingSet.has(r));
          const toRemove = Array.from(existingSet).filter((r) => !nextSet.has(r));

          if (toAdd.length > 0) {
            const { error: addErr } = await supabaseAdmin
              .from("people_roles")
              .insert(toAdd.map((role) => ({ person_id: edit.person_id, role })));
            if (addErr) {
              errors.push({ person_id: edit.person_id, message: `Add roles failed: ${addErr.message}` });
              continue;
            }
          }
          if (toRemove.length > 0) {
            const { error: delErr } = await supabaseAdmin
              .from("people_roles")
              .delete()
              .eq("person_id", edit.person_id)
              .in("role", toRemove);
            if (delErr) {
              errors.push({ person_id: edit.person_id, message: `Remove roles failed: ${delErr.message}` });
              continue;
            }
          }

          // 3. Sync org department (replace single assignment)
          await supabaseAdmin
            .from("people_org_departments")
            .delete()
            .eq("person_id", edit.person_id);

          if (edit.org_department_id) {
            const { error: orgErr } = await supabaseAdmin
              .from("people_org_departments")
              .insert({ person_id: edit.person_id, org_department_id: edit.org_department_id });
            if (orgErr) {
              errors.push({ person_id: edit.person_id, message: `Org dept link failed: ${orgErr.message}` });
              continue;
            }
          }

          // 4. Sync functional departments (replace all)
          await supabaseAdmin
            .from("people_functional_departments")
            .delete()
            .eq("person_id", edit.person_id);

          if (edit.functional_department_ids.length > 0) {
            const { error: funcErr } = await supabaseAdmin
              .from("people_functional_departments")
              .insert(
                edit.functional_department_ids.map((fd_id) => ({
                  person_id: edit.person_id,
                  functional_department_id: fd_id,
                })),
              );
            if (funcErr) {
              errors.push({ person_id: edit.person_id, message: `Functional dept link failed: ${funcErr.message}` });
              continue;
            }
          }

          updated++;
        } catch (err) {
          errors.push({
            person_id: edit.person_id,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return { updated, errors };
    } catch (err) {
      console.error("[commitTeamSetupEdits] unexpected error", err);
      return {
        updated: 0,
        errors: [{ person_id: "", message: err instanceof Error ? err.message : "Unexpected server error" }],
      };
    }
  });
