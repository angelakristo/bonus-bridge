export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actuals: {
        Row: {
          actual_binary: boolean | null
          actual_value: number | null
          entity_id: string
          id: string
          kpi_definition_id: string
          kpi_level: Database["public"]["Enums"]["kpi_level"]
          period: Database["public"]["Enums"]["period"]
          person_id: string | null
          source: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          actual_binary?: boolean | null
          actual_value?: number | null
          entity_id: string
          id?: string
          kpi_definition_id: string
          kpi_level: Database["public"]["Enums"]["kpi_level"]
          period: Database["public"]["Enums"]["period"]
          person_id?: string | null
          source?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          actual_binary?: boolean | null
          actual_value?: number | null
          entity_id?: string
          id?: string
          kpi_definition_id?: string
          kpi_level?: Database["public"]["Enums"]["kpi_level"]
          period?: Database["public"]["Enums"]["period"]
          person_id?: string | null
          source?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actuals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_scheme_tiers: {
        Row: {
          bonus_pct_of_salary: number
          bonus_scheme_id: string
          created_at: string
          id: string
          threshold_max_pct: number | null
          threshold_min_pct: number
        }
        Insert: {
          bonus_pct_of_salary: number
          bonus_scheme_id: string
          created_at?: string
          id?: string
          threshold_max_pct?: number | null
          threshold_min_pct: number
        }
        Update: {
          bonus_pct_of_salary?: number
          bonus_scheme_id?: string
          created_at?: string
          id?: string
          threshold_max_pct?: number | null
          threshold_min_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonus_scheme_tiers_bonus_scheme_id_fkey"
            columns: ["bonus_scheme_id"]
            isOneToOne: false
            referencedRelation: "bonus_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_schemes: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_schemes_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_kpi_targets: {
        Row: {
          corporate_kpi_id: string
          created_at: string
          id: string
          period: Database["public"]["Enums"]["period"]
          target_binary: boolean | null
          target_value: number | null
        }
        Insert: {
          corporate_kpi_id: string
          created_at?: string
          id?: string
          period: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Update: {
          corporate_kpi_id?: string
          created_at?: string
          id?: string
          period?: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "corporate_kpi_targets_corporate_kpi_id_fkey"
            columns: ["corporate_kpi_id"]
            isOneToOne: false
            referencedRelation: "corporate_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_kpis: {
        Row: {
          created_at: string
          display_order: number
          entity_id: string
          id: string
          kpi_definition_id: string
          year: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          entity_id: string
          id?: string
          kpi_definition_id: string
          year: number
        }
        Update: {
          created_at?: string
          display_order?: number
          entity_id?: string
          id?: string
          kpi_definition_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "corporate_kpis_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      department_kpi_targets: {
        Row: {
          created_at: string
          department_kpi_id: string
          id: string
          period: Database["public"]["Enums"]["period"]
          target_binary: boolean | null
          target_value: number | null
        }
        Insert: {
          created_at?: string
          department_kpi_id: string
          id?: string
          period: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Update: {
          created_at?: string
          department_kpi_id?: string
          id?: string
          period?: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "department_kpi_targets_department_kpi_id_fkey"
            columns: ["department_kpi_id"]
            isOneToOne: false
            referencedRelation: "department_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      department_kpis: {
        Row: {
          created_at: string
          display_order: number
          entity_id: string
          functional_department_id: string | null
          id: string
          kpi_definition_id: string
          org_department_id: string | null
          year: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          entity_id: string
          functional_department_id?: string | null
          id?: string
          kpi_definition_id: string
          org_department_id?: string | null
          year: number
        }
        Update: {
          created_at?: string
          display_order?: number
          entity_id?: string
          functional_department_id?: string | null
          id?: string
          kpi_definition_id?: string
          org_department_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_kpis_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_kpis_functional_department_id_fkey"
            columns: ["functional_department_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_kpis_org_department_id_fkey"
            columns: ["org_department_id"]
            isOneToOne: false
            referencedRelation: "organisational_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          culture_pct: number
          efficiency_pct: number
          entity_id: string
          growth_pct: number
          id: string
          year: number
        }
        Insert: {
          created_at?: string
          culture_pct?: number
          efficiency_pct?: number
          entity_id: string
          growth_pct?: number
          id?: string
          year: number
        }
        Update: {
          created_at?: string
          culture_pct?: number
          efficiency_pct?: number
          entity_id?: string
          growth_pct?: number
          id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "drivers_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_bonus_assignments: {
        Row: {
          bonus_scheme_id: string
          created_at: string
          entity_id: string
          id: string
          midyear_bonus_eligible: boolean
          person_id: string
          year: number
          yearend_bonus_eligible: boolean
        }
        Insert: {
          bonus_scheme_id: string
          created_at?: string
          entity_id: string
          id?: string
          midyear_bonus_eligible?: boolean
          person_id: string
          year: number
          yearend_bonus_eligible?: boolean
        }
        Update: {
          bonus_scheme_id?: string
          created_at?: string
          entity_id?: string
          id?: string
          midyear_bonus_eligible?: boolean
          person_id?: string
          year?: number
          yearend_bonus_eligible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_bonus_assignments_bonus_scheme_id_fkey"
            columns: ["bonus_scheme_id"]
            isOneToOne: false
            referencedRelation: "bonus_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_group_weights: {
        Row: {
          corporate_weight_pct: number
          created_at: string
          department_weight_pct: number
          entity_id: string
          id: string
          individual_weight_pct: number
          person_id: string
          year: number
        }
        Insert: {
          corporate_weight_pct?: number
          created_at?: string
          department_weight_pct?: number
          entity_id: string
          id?: string
          individual_weight_pct?: number
          person_id: string
          year: number
        }
        Update: {
          corporate_weight_pct?: number
          created_at?: string
          department_weight_pct?: number
          entity_id?: string
          id?: string
          individual_weight_pct?: number
          person_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_group_weights_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_group_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_group_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_item_weights: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          kpi_assignment_id: string
          kpi_level: Database["public"]["Enums"]["kpi_level"]
          person_id: string
          weight_pct: number
          year: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          kpi_assignment_id: string
          kpi_level: Database["public"]["Enums"]["kpi_level"]
          person_id: string
          weight_pct?: number
          year: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          kpi_assignment_id?: string
          kpi_level?: Database["public"]["Enums"]["kpi_level"]
          person_id?: string
          weight_pct?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_item_weights_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_item_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_item_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          id: string
          industry: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
        }
        Relationships: []
      }
      excel_uploads: {
        Row: {
          entity_id: string
          error_log: string | null
          file_name: string
          id: string
          row_count: number | null
          status: Database["public"]["Enums"]["upload_status"]
          upload_type: Database["public"]["Enums"]["upload_type"]
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          entity_id: string
          error_log?: string | null
          file_name: string
          id?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          upload_type: Database["public"]["Enums"]["upload_type"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          entity_id?: string
          error_log?: string | null
          file_name?: string
          id?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          upload_type?: Database["public"]["Enums"]["upload_type"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "excel_uploads_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excel_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excel_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      functions: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      individual_kpi_targets: {
        Row: {
          created_at: string
          id: string
          individual_kpi_id: string
          period: Database["public"]["Enums"]["period"]
          target_binary: boolean | null
          target_value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          individual_kpi_id: string
          period: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          individual_kpi_id?: string
          period?: Database["public"]["Enums"]["period"]
          target_binary?: boolean | null
          target_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_kpi_targets_individual_kpi_id_fkey"
            columns: ["individual_kpi_id"]
            isOneToOne: false
            referencedRelation: "individual_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_kpis: {
        Row: {
          approval_note: string | null
          approved_by: string | null
          created_at: string
          display_order: number
          entity_id: string
          id: string
          is_active: boolean
          kpi_definition_id: string
          person_id: string
          proposed_by: string | null
          status: Database["public"]["Enums"]["kpi_status"]
          year: number
        }
        Insert: {
          approval_note?: string | null
          approved_by?: string | null
          created_at?: string
          display_order?: number
          entity_id: string
          id?: string
          is_active?: boolean
          kpi_definition_id: string
          person_id: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["kpi_status"]
          year: number
        }
        Update: {
          approval_note?: string | null
          approved_by?: string | null
          created_at?: string
          display_order?: number
          entity_id?: string
          id?: string
          is_active?: boolean
          kpi_definition_id?: string
          person_id?: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["kpi_status"]
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "individual_kpis_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_kpis_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          driver: Database["public"]["Enums"]["driver"]
          entity_id: string
          id: string
          is_active: boolean
          kpi_type: Database["public"]["Enums"]["kpi_type"]
          title: string
          unit: string | null
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver: Database["public"]["Enums"]["driver"]
          entity_id: string
          id?: string
          is_active?: boolean
          kpi_type: Database["public"]["Enums"]["kpi_type"]
          title: string
          unit?: string | null
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver?: Database["public"]["Enums"]["driver"]
          entity_id?: string
          id?: string
          is_active?: boolean
          kpi_type?: Database["public"]["Enums"]["kpi_type"]
          title?: string
          unit?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      organisational_departments: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisational_departments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisational_departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organisational_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          annual_salary: number | null
          auth_user_id: string | null
          created_at: string
          email: string
          employment_start_date: string | null
          entity_id: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          position: string | null
        }
        Insert: {
          annual_salary?: number | null
          auth_user_id?: string | null
          created_at?: string
          email: string
          employment_start_date?: string | null
          entity_id?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          position?: string | null
        }
        Update: {
          annual_salary?: number | null
          auth_user_id?: string | null
          created_at?: string
          email?: string
          employment_start_date?: string | null
          entity_id?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      people_functional_departments: {
        Row: {
          functional_department_id: string
          person_id: string
        }
        Insert: {
          functional_department_id: string
          person_id: string
        }
        Update: {
          functional_department_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_functional_departments_functional_department_id_fkey"
            columns: ["functional_department_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_functional_departments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_functional_departments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      people_org_departments: {
        Row: {
          org_department_id: string
          person_id: string
        }
        Insert: {
          org_department_id: string
          person_id: string
        }
        Update: {
          org_department_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_org_departments_org_department_id_fkey"
            columns: ["org_department_id"]
            isOneToOne: false
            referencedRelation: "organisational_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_org_departments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_org_departments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      people_roles: {
        Row: {
          id: string
          person_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          id?: string
          person_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "people_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_progress: {
        Row: {
          entity_id: string
          id: string
          status: Database["public"]["Enums"]["setup_step_status"]
          step_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          entity_id: string
          id?: string
          status?: Database["public"]["Enums"]["setup_step_status"]
          step_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          entity_id?: string
          id?: string
          status?: Database["public"]["Enums"]["setup_step_status"]
          step_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_bonus_projections: {
        Row: {
          annual_salary: number | null
          bonus_scheme_id: string | null
          entity_id: string | null
          midyear_bonus_eligible: boolean | null
          person_id: string | null
          scheme_name: string | null
          year: number | null
          yearend_bonus_eligible: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_bonus_assignments_bonus_scheme_id_fkey"
            columns: ["bonus_scheme_id"]
            isOneToOne: false
            referencedRelation: "bonus_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bonus_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_employee_weighted_scores: {
        Row: {
          corporate_weight_pct: number | null
          department_weight_pct: number | null
          entity_id: string | null
          individual_weight_pct: number | null
          person_id: string | null
          year: number | null
        }
        Insert: {
          corporate_weight_pct?: number | null
          department_weight_pct?: number | null
          entity_id?: string | null
          individual_weight_pct?: number | null
          person_id?: string | null
          year?: number | null
        }
        Update: {
          corporate_weight_pct?: number | null
          department_weight_pct?: number | null
          entity_id?: string | null
          individual_weight_pct?: number | null
          person_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_group_weights_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_group_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_group_weights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_actuals_with_targets: {
        Row: {
          achievement_pct: number | null
          actual_binary: boolean | null
          actual_id: string | null
          actual_value: number | null
          corporate_target_binary: boolean | null
          corporate_target_value: number | null
          driver: Database["public"]["Enums"]["driver"] | null
          entity_id: string | null
          kpi_definition_id: string | null
          kpi_level: Database["public"]["Enums"]["kpi_level"] | null
          kpi_title: string | null
          kpi_type: Database["public"]["Enums"]["kpi_type"] | null
          period: Database["public"]["Enums"]["period"] | null
          person_id: string | null
          unit: string | null
          uploaded_at: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actuals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_people_public: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          employment_start_date: string | null
          entity_id: string | null
          first_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          employment_start_date?: string | null
          entity_id?: string | null
          first_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          employment_start_date?: string | null
          entity_id?: string | null
          first_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_my_entity_id: { Args: never; Returns: string }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"][]
      }
    }
    Enums: {
      driver: "growth" | "efficiency" | "culture"
      kpi_level: "corporate" | "department" | "individual"
      kpi_status: "draft" | "pending_approval" | "approved" | "rejected"
      kpi_type: "progressive" | "binary" | "benchmark"
      period: "q1" | "q2" | "q3" | "q4" | "h1" | "h2" | "halfyear" | "fullyear"
      setup_step_status: "not_started" | "in_progress" | "complete"
      upload_status: "processing" | "success" | "failed"
      upload_type: "employees" | "actuals"
      user_role: "ceo" | "manager" | "hr_rep" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      driver: ["growth", "efficiency", "culture"],
      kpi_level: ["corporate", "department", "individual"],
      kpi_status: ["draft", "pending_approval", "approved", "rejected"],
      kpi_type: ["progressive", "binary", "benchmark"],
      period: ["q1", "q2", "q3", "q4", "h1", "h2", "halfyear", "fullyear"],
      setup_step_status: ["not_started", "in_progress", "complete"],
      upload_status: ["processing", "success", "failed"],
      upload_type: ["employees", "actuals"],
      user_role: ["ceo", "manager", "hr_rep", "employee"],
    },
  },
} as const
