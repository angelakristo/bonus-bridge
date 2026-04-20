import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RowSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  annual_salary: z.string(),
  employment_start_date: z.string(),
  role: z.enum(["ceo", "manager", "hr_rep", "employee"]),
  org_department: z.string().min(1),
});

const InputSchema = z.object({
  entity_id: z.string().uuid(),
  uploaded_by_person_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  rows: z.array(RowSchema).min(1).max(2000),
});

export type CommitEmployeeUploadResult = {
  inserted: number;
  inviteFailures: { email: string; reason: string }[];
  partialError?: string;
};

export const commitEmployeeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CommitEmployeeUploadResult> => {
    const { entity_id, uploaded_by_person_id, file_name, rows } = data;

    // Pre-flight: resolve org department names → ids
    const orgRes = await supabaseAdmin
      .from("organisational_departments")
      .select("id, name")
      .eq("entity_id", entity_id);

    if (orgRes.error) {
      return {
        inserted: 0,
        inviteFailures: [],
        partialError: `Failed to load org departments: ${orgRes.error.message}`,
      };
    }

    const orgMap = new Map((orgRes.data ?? []).map((r) => [r.name, r.id]));

    const insertedPersonIds: string[] = [];
    const inviteFailures: { email: string; reason: string }[] = [];
    let partialError: string | undefined;

    for (const row of rows) {
      const orgId = orgMap.get(row.org_department);

      if (!orgId) {
        partialError = `Row for ${row.email}: org department lookup failed (${row.org_department}).`;
        break;
      }

      // 1. INSERT people
      const personInsert = await supabaseAdmin
        .from("people")
        .insert({
          entity_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          annual_salary:
            row.annual_salary === "" ? null : Number(row.annual_salary),
          employment_start_date:
            row.employment_start_date === "" ? null : row.employment_start_date,
          is_active: true,
        })
        .select("id")
        .single();

      if (personInsert.error || !personInsert.data) {
        partialError = `Failed to insert ${row.email}: ${personInsert.error?.message ?? "unknown error"}`;
        break;
      }

      const personId = personInsert.data.id;

      // 2. INSERT people_roles
      const roleInsert = await supabaseAdmin
        .from("people_roles")
        .insert({ person_id: personId, role: row.role });

      if (roleInsert.error) {
        await supabaseAdmin.from("people").delete().eq("id", personId);
        partialError = `Failed to insert role for ${row.email}: ${roleInsert.error.message}`;
        break;
      }

      // 3. INSERT people_org_departments
      const orgLinkInsert = await supabaseAdmin
        .from("people_org_departments")
        .insert({ person_id: personId, org_department_id: orgId });

      if (orgLinkInsert.error) {
        await supabaseAdmin.from("people_roles").delete().eq("person_id", personId);
        await supabaseAdmin.from("people").delete().eq("id", personId);
        partialError = `Failed to link org dept for ${row.email}: ${orgLinkInsert.error.message}`;
        break;
      }

      // 4. Auth invite (failures don't abort the row)
      try {
        const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email);
        if (invite.error || !invite.data?.user?.id) {
          inviteFailures.push({
            email: row.email,
            reason: invite.error?.message ?? "Unknown invite error",
          });
        } else {
          const updateRes = await supabaseAdmin
            .from("people")
            .update({ auth_user_id: invite.data.user.id })
            .eq("id", personId);
          if (updateRes.error) {
            inviteFailures.push({
              email: row.email,
              reason: `Invited but failed to link auth user: ${updateRes.error.message}`,
            });
          }
        }
      } catch (err) {
        inviteFailures.push({
          email: row.email,
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      insertedPersonIds.push(personId);
    }

    // Only log a successful upload event if no partial error occurred.
    if (!partialError && insertedPersonIds.length > 0) {
      const logRes = await supabaseAdmin.from("excel_uploads").insert({
        entity_id,
        uploaded_by: uploaded_by_person_id,
        file_name,
        upload_type: "employees",
        status: "success",
        row_count: insertedPersonIds.length,
      });
      if (logRes.error) {
        console.error("[commitEmployeeUpload] excel_uploads log failed", logRes.error);
      }
    }

    return {
      inserted: insertedPersonIds.length,
      inviteFailures,
      partialError,
    };
  });
