import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLE_ENUM = z.enum(["ceo", "manager", "hr_rep", "employee"]);

const RowSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  position: z.string().optional(),
  annual_salary: z.string(),
  employment_start_date: z.string(),
  roles: z.array(ROLE_ENUM).min(1).default(["employee"]),
  department: z.string().min(1),
  functional_department_ids: z.array(z.string().uuid()).optional(),
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
  .inputValidator((input: unknown) => {
    console.log("[Server] inputValidator received keys:", Object.keys(input as object ?? {}).join(", "));
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error("[Server] Zod validation failed:", msg);
      throw new Error(`Invalid upload payload: ${msg}`);
    }
    console.log("[Server] Zod OK — rows:", parsed.data.rows.length);
    return parsed.data;
  })
  .handler(async ({ data }): Promise<CommitEmployeeUploadResult> => {
    console.log("[Server] commitEmployeeUpload handler called:", {
      entity_id: data.entity_id,
      uploaded_by: data.uploaded_by_person_id,
      file_name: data.file_name,
      rowCount: data.rows.length,
    });

    try {
      // Load department mapping
      console.log("[Server] Loading departments for entity:", data.entity_id);
      const orgRes = await supabaseAdmin
        .from("organisational_departments")
        .select("id, name")
        .eq("entity_id", data.entity_id);

      if (orgRes.error) {
        console.error("[Server] Department load error:", orgRes.error);
        return {
          inserted: 0,
          inviteFailures: [],
          partialError: `Failed to load departments: ${orgRes.error.message}`,
        };
      }

      const orgMap = new Map((orgRes.data ?? []).map((r) => [r.name, r.id]));
      console.log("[Server] Department map:", [...orgMap.entries()]);

      const insertedPersonIds: string[] = [];
      const inviteFailures: { email: string; reason: string }[] = [];
      let partialError: string | undefined;

      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        console.log(`[Server] Row ${i + 1}:`, { email: row.email, department: row.department, roles: row.roles });

        const orgId = orgMap.get(row.department);
        console.log(`[Server] Department "${row.department}" → orgId:`, orgId ?? "NOT FOUND");

        if (!orgId) {
          partialError = `Row ${i + 1}: Department "${row.department}" not found. Available: ${[...orgMap.keys()].join(", ")}`;
          console.error("[Server]", partialError);
          break;
        }

        // INSERT people
        const annualSalary =
          row.annual_salary && row.annual_salary.trim() !== "" ? Number(row.annual_salary) : null;
        const startDate =
          row.employment_start_date && row.employment_start_date.trim() !== ""
            ? row.employment_start_date
            : null;

        const personInsert = await supabaseAdmin
          .from("people")
          .insert({
            entity_id: data.entity_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            position: row.position?.trim() || null,
            annual_salary: annualSalary,
            employment_start_date: startDate,
            is_active: true,
          })
          .select("id")
          .single();

        console.log(`[Server] Person insert result:`, {
          data: personInsert.data,
          error: personInsert.error?.message,
        });

        if (personInsert.error || !personInsert.data) {
          partialError = `Row ${i + 1}: Failed to insert ${row.email}: ${personInsert.error?.message ?? "unknown error"}`;
          console.error("[Server]", partialError);
          break;
        }

        const personId = personInsert.data.id;

        // INSERT people_roles
        const roleInsert = await supabaseAdmin
          .from("people_roles")
          .insert(row.roles.map((role) => ({ person_id: personId, role })));

        console.log(`[Server] Role insert:`, { error: roleInsert.error?.message });

        if (roleInsert.error) {
          await supabaseAdmin.from("people").delete().eq("id", personId);
          partialError = `Row ${i + 1}: Failed to assign roles to ${row.email}: ${roleInsert.error.message}`;
          console.error("[Server]", partialError);
          break;
        }

        // INSERT people_org_departments
        const orgLinkInsert = await supabaseAdmin
          .from("people_org_departments")
          .insert({ person_id: personId, org_department_id: orgId });

        console.log(`[Server] Org dept link:`, { error: orgLinkInsert.error?.message });

        if (orgLinkInsert.error) {
          await supabaseAdmin.from("people_roles").delete().eq("person_id", personId);
          await supabaseAdmin.from("people").delete().eq("id", personId);
          partialError = `Row ${i + 1}: Failed to link ${row.email} to department: ${orgLinkInsert.error.message}`;
          console.error("[Server]", partialError);
          break;
        }

        // INSERT people_functional_departments (optional)
        if (row.functional_department_ids && row.functional_department_ids.length > 0) {
          const funcInsert = await supabaseAdmin
            .from("people_functional_departments")
            .insert(
              row.functional_department_ids.map((fd_id) => ({
                person_id: personId,
                functional_department_id: fd_id,
              })),
            );
          if (funcInsert.error) {
            console.warn(`[Server] Functional dept link failed for ${row.email}:`, funcInsert.error.message);
          }
        }

        // Auth invite (non-blocking)
        try {
          const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email);
          if (invite.error || !invite.data?.user?.id) {
            console.warn(`[Server] Invite failed for ${row.email}:`, invite.error?.message);
            inviteFailures.push({ email: row.email, reason: invite.error?.message ?? "Unknown invite error" });
          } else {
            const updateRes = await supabaseAdmin
              .from("people")
              .update({ auth_user_id: invite.data.user.id })
              .eq("id", personId);
            if (updateRes.error) {
              console.warn(`[Server] Auth user link failed for ${row.email}:`, updateRes.error.message);
              inviteFailures.push({ email: row.email, reason: `Invited but failed to link: ${updateRes.error.message}` });
            }
          }
        } catch (inviteErr) {
          console.warn(`[Server] Invite exception for ${row.email}:`, inviteErr);
          inviteFailures.push({ email: row.email, reason: inviteErr instanceof Error ? inviteErr.message : String(inviteErr) });
        }

        insertedPersonIds.push(personId);
        console.log(`[Server] Row ${i + 1} complete. Total inserted so far:`, insertedPersonIds.length);
      }

      // Safety net: if nothing inserted and no error captured, force an error.
      if (insertedPersonIds.length === 0 && !partialError) {
        partialError = `No rows were inserted (${data.rows.length} attempted). All DB operations may have failed silently — check server logs.`;
        console.error("[Server]", partialError);
      }

      // Log upload event
      if (!partialError && insertedPersonIds.length > 0) {
        const logRes = await supabaseAdmin.from("excel_uploads").insert({
          entity_id: data.entity_id,
          uploaded_by: data.uploaded_by_person_id,
          file_name: data.file_name,
          upload_type: "employees",
          status: "success",
          row_count: insertedPersonIds.length,
        });
        if (logRes.error) {
          console.warn("[Server] excel_uploads log failed:", logRes.error.message);
        }
      }

      const result = { inserted: insertedPersonIds.length, inviteFailures, partialError };
      console.log("[Server] Returning:", result);
      return result;
    } catch (err) {
      console.error("[Server] Unexpected exception:", err);
      return {
        inserted: 0,
        inviteFailures: [],
        partialError: `Server error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
