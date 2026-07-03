import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


export type ProjectLeader = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  roles: string[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  industry: string | null;
  created_at: string | null;
  leaders: ProjectLeader[];
  total_people: number;
  has_ceo: boolean;
  has_hr_rep: boolean;
  corporate_kpi_count: number;
  department_kpi_count: number;
  total_kpi_count: number;
  org_department_count: number;
  functional_department_count: number;
  progress_pct: number | null;
  payout_pct: number | null;
  payout_amount: number | null;
};


const PERIOD_PRIORITY = ["fullyear", "halfyear", "q4", "q3", "q2", "q1"] as const;

export const masterListProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectSummary[]> => {
    const { data: entities, error: entitiesErr } = await supabaseAdmin
      .from("entities")
      .select("id, name, industry, created_at")
      .order("created_at", { ascending: false });

    if (entitiesErr) throw new Error(`Failed to list entities: ${entitiesErr.message}`);
    if (!entities || entities.length === 0) return [];

    const entityIds = entities.map((e) => e.id);

    // ── Batch fetch 1: all queries independent of each other ──────────────────
    const [
      allPeopleRes,
      allCorpKpisRes,
      allDeptKpisRes,
      allOrgDeptsRes,
      allProgressRes,
      allBonusAssignmentsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("people")
        .select("id, entity_id, first_name, last_name, email, annual_salary, people_roles(role)")
        .in("entity_id", entityIds),
      supabaseAdmin
        .from("corporate_kpis")
        .select("id, entity_id, year")
        .in("entity_id", entityIds),
      supabaseAdmin
        .from("department_kpis")
        .select("id, entity_id, year")
        .in("entity_id", entityIds),
      supabaseAdmin
        .from("organisational_departments")
        .select("id, entity_id")
        .in("entity_id", entityIds),
      supabaseAdmin
        .from("v_kpi_actuals_with_targets")
        .select("entity_id, achievement_pct, year, period")
        .in("entity_id", entityIds)
        .eq("kpi_level", "corporate")
        .in("period", [...PERIOD_PRIORITY]),
      supabaseAdmin
        .from("employee_bonus_assignments")
        .select("entity_id, person_id, bonus_scheme_id, year, yearend_bonus_eligible")
        .in("entity_id", entityIds)
        .eq("yearend_bonus_eligible", true),
    ]);

    const allPeople = allPeopleRes.data ?? [];
    const allCorpKpis = allCorpKpisRes.data ?? [];
    const allDeptKpis = allDeptKpisRes.data ?? [];
    const allOrgDepts = allOrgDeptsRes.data ?? [];
    const allProgress = allProgressRes.data ?? [];
    const allBonusAssignments = allBonusAssignmentsRes.data ?? [];

    const allPersonIds = allPeople.map((p) => p.id);
    const allBonusSchemeIds = [...new Set(allBonusAssignments.map((a) => a.bonus_scheme_id))];

    // ── Batch fetch 2: depends on step 1 results ──────────────────────────────
    const [funcDeptsRes, bonusTiersRes] = await Promise.all([
      allPersonIds.length > 0
        ? supabaseAdmin
            .from("people_functional_departments")
            .select("person_id, functional_department_id")
            .in("person_id", allPersonIds)
        : Promise.resolve({ data: [] as { person_id: string; functional_department_id: string }[] }),
      allBonusSchemeIds.length > 0
        ? supabaseAdmin
            .from("bonus_scheme_tiers")
            .select("bonus_scheme_id, threshold_min_pct, threshold_max_pct, bonus_pct_of_salary")
            .in("bonus_scheme_id", allBonusSchemeIds)
        : Promise.resolve({
            data: [] as {
              bonus_scheme_id: string;
              threshold_min_pct: number;
              threshold_max_pct: number | null;
              bonus_pct_of_salary: number;
            }[],
          }),
    ]);

    const allFuncDepts = funcDeptsRes.data ?? [];
    const allBonusTiers = bonusTiersRes.data ?? [];

    // ── Build lookup maps ─────────────────────────────────────────────────────

    const peopleByEntity = new Map<string, typeof allPeople>();
    for (const p of allPeople) {
      if (!peopleByEntity.has(p.entity_id)) peopleByEntity.set(p.entity_id, []);
      peopleByEntity.get(p.entity_id)!.push(p);
    }

    const corpKpisByEntity = new Map<string, typeof allCorpKpis>();
    for (const k of allCorpKpis) {
      if (!corpKpisByEntity.has(k.entity_id)) corpKpisByEntity.set(k.entity_id, []);
      corpKpisByEntity.get(k.entity_id)!.push(k);
    }

    const deptKpisByEntity = new Map<string, typeof allDeptKpis>();
    for (const k of allDeptKpis) {
      if (!deptKpisByEntity.has(k.entity_id)) deptKpisByEntity.set(k.entity_id, []);
      deptKpisByEntity.get(k.entity_id)!.push(k);
    }

    const orgDeptsByEntity = new Map<string, typeof allOrgDepts>();
    for (const d of allOrgDepts) {
      if (!orgDeptsByEntity.has(d.entity_id)) orgDeptsByEntity.set(d.entity_id, []);
      orgDeptsByEntity.get(d.entity_id)!.push(d);
    }

    const bonusAssignmentsByEntity = new Map<string, typeof allBonusAssignments>();
    for (const a of allBonusAssignments) {
      if (!bonusAssignmentsByEntity.has(a.entity_id)) bonusAssignmentsByEntity.set(a.entity_id, []);
      bonusAssignmentsByEntity.get(a.entity_id)!.push(a);
    }

    // functional_department_id sets per person
    const funcDeptsByPerson = new Map<string, Set<string>>();
    for (const fd of allFuncDepts) {
      if (!funcDeptsByPerson.has(fd.person_id)) funcDeptsByPerson.set(fd.person_id, new Set());
      funcDeptsByPerson.get(fd.person_id)!.add(fd.functional_department_id);
    }

    // bonus tiers per scheme
    const tiersByScheme = new Map<string, typeof allBonusTiers>();
    for (const t of allBonusTiers) {
      if (!tiersByScheme.has(t.bonus_scheme_id)) tiersByScheme.set(t.bonus_scheme_id, []);
      tiersByScheme.get(t.bonus_scheme_id)!.push(t);
    }

    // progress per entity: pick most recent year then highest-priority period
    const progressByEntity = new Map<string, number | null>();
    for (const entityId of entityIds) {
      const rows = allProgress.filter((r) => r.entity_id === entityId);
      if (rows.length === 0) { progressByEntity.set(entityId, null); continue; }

      const years = [...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))];
      const latestYear = years.length > 0 ? Math.max(...years) : null;
      if (latestYear === null) { progressByEntity.set(entityId, null); continue; }

      let found = false;
      for (const period of PERIOD_PRIORITY) {
        const slice = rows.filter((r) => r.year === latestYear && r.period === period);
        if (slice.length === 0) continue;
        const vals = slice
          .map((r) => r.achievement_pct)
          .filter((v): v is number => v !== null);
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        progressByEntity.set(entityId, avg);
        found = true;
        break;
      }
      if (!found) progressByEntity.set(entityId, null);
    }

    // ── Assemble per-entity summaries ─────────────────────────────────────────

    return entities.map((entity) => {
      const people = peopleByEntity.get(entity.id) ?? [];
      const corpKpis = corpKpisByEntity.get(entity.id) ?? [];
      const deptKpis = deptKpisByEntity.get(entity.id) ?? [];
      const orgDepts = orgDeptsByEntity.get(entity.id) ?? [];
      const bonusAssignments = bonusAssignmentsByEntity.get(entity.id) ?? [];

      // Leaders and role flags
      const allRoles = people.flatMap(
        (p) => (p.people_roles as { role: string }[] | null)?.map((r) => r.role) ?? [],
      );
      const leaders: ProjectLeader[] = people
        .filter((p) => {
          const roles = (p.people_roles as { role: string }[] | null)?.map((r) => r.role) ?? [];
          return roles.includes("ceo") || roles.includes("hr_rep");
        })
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          roles: (p.people_roles as { role: string }[] | null)?.map((r) => r.role) ?? [],
        }));

      // KPI counts — use the latest year that has corporate KPIs
      const kpiYears = [...new Set(corpKpis.map((k) => k.year))];
      const latestKpiYear = kpiYears.length > 0 ? Math.max(...kpiYears) : null;
      const corporate_kpi_count = latestKpiYear
        ? corpKpis.filter((k) => k.year === latestKpiYear).length
        : corpKpis.length;
      const department_kpi_count = latestKpiYear
        ? deptKpis.filter((k) => k.year === latestKpiYear).length
        : deptKpis.length;

      // Functional departments — distinct IDs across this entity's people
      const funcDeptIds = new Set<string>();
      for (const p of people) {
        const fds = funcDeptsByPerson.get(p.id);
        if (fds) fds.forEach((id) => funcDeptIds.add(id));
      }

      // Progress
      const progress_pct = progressByEntity.get(entity.id) ?? null;

      // Payout projection using company-level progress as proxy per-employee
      let payout_amount: number | null = null;
      let payout_pct: number | null = null;

      if (bonusAssignments.length > 0) {
        let projectedTotal = 0;
        let maxPotentialTotal = 0;
        let hasUsablePeople = false;

        for (const assignment of bonusAssignments) {
          const person = people.find((p) => p.id === assignment.person_id);
          const salary = person?.annual_salary ?? 0;
          if (salary <= 0) continue;

          const tiers = tiersByScheme.get(assignment.bonus_scheme_id) ?? [];
          if (tiers.length === 0) continue;

          hasUsablePeople = true;

          // Max potential = tier with highest bonus_pct_of_salary
          const maxBonusPct = Math.max(...tiers.map((t) => t.bonus_pct_of_salary));
          maxPotentialTotal += (maxBonusPct / 100) * salary;

          // Projected = tier matching current company progress
          if (progress_pct !== null) {
            const tier = tiers.find(
              (t) =>
                progress_pct >= t.threshold_min_pct &&
                (t.threshold_max_pct === null || progress_pct < t.threshold_max_pct),
            );
            if (tier) projectedTotal += (tier.bonus_pct_of_salary / 100) * salary;
          }
        }

        if (hasUsablePeople && maxPotentialTotal > 0) {
          payout_amount = progress_pct !== null ? projectedTotal : null;
          payout_pct =
            payout_amount !== null ? (payout_amount / maxPotentialTotal) * 100 : null;
        }
      }

      return {
        id: entity.id,
        name: entity.name,
        industry: entity.industry,
        created_at: entity.created_at,
        leaders,
        total_people: people.length,
        has_ceo: allRoles.includes("ceo"),
        has_hr_rep: allRoles.includes("hr_rep"),
        corporate_kpi_count,
        department_kpi_count,
        total_kpi_count: corporate_kpi_count + department_kpi_count,
        org_department_count: orgDepts.length,
        functional_department_count: funcDeptIds.size,
        progress_pct,
        payout_pct,
        payout_amount,
      };
    });
  },
);

// ─── Create a new project with bootstrap users ────────────────────────────────

const BootstrapUserSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  roles: z.array(z.enum(["ceo", "hr_rep"])).min(1),
});

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(200).optional(),
  bootstrap_users: z.array(BootstrapUserSchema).min(1),
});

export type BootstrapUserInput = z.infer<typeof BootstrapUserSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export type CreatedUser = {
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
};

export type CreateProjectResult = {
  entity_id: string;
  entity_name: string;
  created_users: CreatedUser[];
  errors: { email: string; reason: string }[];
};

export const masterCreateProject = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = CreateProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<CreateProjectResult> => {
    const { name, industry, bootstrap_users } = data;

    // 1. Create entity
    const entityRes = await supabaseAdmin
      .from("entities")
      .insert({ name, industry: industry ?? null })
      .select("id, name")
      .single();
    if (entityRes.error || !entityRes.data) {
      throw new Error(`Failed to create entity: ${entityRes.error?.message}`);
    }
    const entityId = entityRes.data.id;

    // 2. Create bootstrap users
    const created_users: CreatedUser[] = [];
    const errors: { email: string; reason: string }[] = [];

    for (const user of bootstrap_users) {
      try {
        const authRes = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
        });

        if (authRes.error || !authRes.data.user) {
          errors.push({
            email: user.email,
            reason: authRes.error?.message ?? "Failed to create auth user",
          });
          continue;
        }

        const authUserId = authRes.data.user.id;

        const personRes = await supabaseAdmin
          .from("people")
          .insert({
            entity_id: entityId,
            auth_user_id: authUserId,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            is_active: true,
          })
          .select("id")
          .single();

        if (personRes.error || !personRes.data) {
          errors.push({
            email: user.email,
            reason: `Person insert failed: ${personRes.error?.message}`,
          });
          continue;
        }

        const personId = personRes.data.id;

        await supabaseAdmin
          .from("people_roles")
          .insert(user.roles.map((role) => ({ person_id: personId, role })));

        created_users.push({
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          roles: user.roles,
        });
      } catch (err) {
        errors.push({
          email: user.email,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { entity_id: entityId, entity_name: name, created_users, errors };
  });

// ─── Delete a project and all its data ───────────────────────────────────────

const DeleteProjectSchema = z.object({
  entity_id: z.string().uuid(),
});

export const masterDeleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = DeleteProjectSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    return parsed.data;
  })
  .handler(async ({ data }) => {
    const { entity_id } = data;

    // 1. Collect IDs needed for child table deletions
    const [peopleRes, corpKpisRes, deptKpisRes, indivKpisRes, bonusSchemesRes] = await Promise.all([
      supabaseAdmin.from("people").select("id, auth_user_id").eq("entity_id", entity_id),
      supabaseAdmin.from("corporate_kpis").select("id").eq("entity_id", entity_id),
      supabaseAdmin.from("department_kpis").select("id").eq("entity_id", entity_id),
      supabaseAdmin.from("individual_kpis").select("id").eq("entity_id", entity_id),
      supabaseAdmin.from("bonus_schemes").select("id").eq("entity_id", entity_id),
    ]);

    const personIds = (peopleRes.data ?? []).map((p) => p.id);
    const authUserIds = (peopleRes.data ?? [])
      .map((p) => p.auth_user_id)
      .filter((id): id is string => id !== null);
    const corpKpiIds = (corpKpisRes.data ?? []).map((k) => k.id);
    const deptKpiIds = (deptKpisRes.data ?? []).map((k) => k.id);
    const indivKpiIds = (indivKpisRes.data ?? []).map((k) => k.id);
    const bonusSchemeIds = (bonusSchemesRes.data ?? []).map((s) => s.id);

    // 2. Delete leaf/child rows (all in parallel, they have no children)
    await Promise.all([
      supabaseAdmin.from("actuals").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("employee_kpi_item_weights").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("employee_kpi_group_weights").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("excel_uploads").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("employee_bonus_assignments").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("setup_progress").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("drivers").delete().eq("entity_id", entity_id),
      ...(corpKpiIds.length > 0
        ? [supabaseAdmin.from("corporate_kpi_targets").delete().in("corporate_kpi_id", corpKpiIds)]
        : []),
      ...(deptKpiIds.length > 0
        ? [supabaseAdmin.from("department_kpi_targets").delete().in("department_kpi_id", deptKpiIds)]
        : []),
      ...(indivKpiIds.length > 0
        ? [supabaseAdmin.from("individual_kpi_targets").delete().in("individual_kpi_id", indivKpiIds)]
        : []),
      ...(bonusSchemeIds.length > 0
        ? [supabaseAdmin.from("bonus_scheme_tiers").delete().in("bonus_scheme_id", bonusSchemeIds)]
        : []),
      ...(personIds.length > 0
        ? [
            supabaseAdmin.from("people_org_departments").delete().in("person_id", personIds),
            supabaseAdmin.from("people_functional_departments").delete().in("person_id", personIds),
            supabaseAdmin.from("people_roles").delete().in("person_id", personIds),
          ]
        : []),
    ]);

    // 3. Delete parent rows (KPIs, bonus schemes — now that targets/tiers are gone)
    await Promise.all([
      supabaseAdmin.from("individual_kpis").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("department_kpis").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("corporate_kpis").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("bonus_schemes").delete().eq("entity_id", entity_id),
    ]);

    // 4. Delete people and org structure
    await Promise.all([
      supabaseAdmin.from("people").delete().eq("entity_id", entity_id),
      supabaseAdmin.from("organisational_departments").delete().eq("entity_id", entity_id),
    ]);

    // 5. Delete the entity itself
    const { error: entityDeleteErr } = await supabaseAdmin
      .from("entities")
      .delete()
      .eq("id", entity_id);
    if (entityDeleteErr) throw new Error(`Failed to delete entity: ${entityDeleteErr.message}`);

    // 6. Delete Supabase auth users
    await Promise.all(authUserIds.map((id) => supabaseAdmin.auth.admin.deleteUser(id)));
  });
