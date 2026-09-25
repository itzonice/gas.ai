export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      assignments: {
        Row: {
          category_id: string | null;
          completed_at: string | null;
          course_id: string;
          created_at: string;
          description: string | null;
          due_at: string | null;
          estimated_minutes: number | null;
          external_id: string | null;
          external_updated_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["assignment_kind"];
          points_earned: number | null;
          points_possible: number | null;
          source: string;
          status: Database["public"]["Enums"]["assignment_status"];
          title: string;
          updated_at: string;
          user_edited_fields: string[];
        };
        Insert: {
          category_id?: string | null;
          completed_at?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          estimated_minutes?: number | null;
          external_id?: string | null;
          external_updated_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          points_earned?: number | null;
          points_possible?: number | null;
          source?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          title: string;
          updated_at?: string;
          user_edited_fields?: string[];
        };
        Update: {
          category_id?: string | null;
          completed_at?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          estimated_minutes?: number | null;
          external_id?: string | null;
          external_updated_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          points_earned?: number | null;
          points_possible?: number | null;
          source?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          title?: string;
          updated_at?: string;
          user_edited_fields?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "assignments_category_fkey";
            columns: ["category_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "grade_categories";
            referencedColumns: ["id", "course_id"];
          },
          {
            foreignKeyName: "assignments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
        ];
      };
      billing_customers: {
        Row: {
          created_at: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          stripe_customer_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          event_created_at: string;
          event_id: string;
          event_type: string;
          provider: Database["public"]["Enums"]["billing_provider"];
          received_at: string;
          result: string | null;
          user_id: string | null;
        };
        Insert: {
          event_created_at: string;
          event_id: string;
          event_type: string;
          provider: Database["public"]["Enums"]["billing_provider"];
          received_at?: string;
          result?: string | null;
          user_id?: string | null;
        };
        Update: {
          event_created_at?: string;
          event_id?: string;
          event_type?: string;
          provider?: Database["public"]["Enums"]["billing_provider"];
          received_at?: string;
          result?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          archived_at: string | null;
          code: string | null;
          color: string | null;
          created_at: string;
          external_id: string | null;
          id: string;
          instructor: string | null;
          letter_scale: Json | null;
          lms_connection_id: string | null;
          name: string;
          target_grade: number | null;
          term_end: string | null;
          term_start: string | null;
          updated_at: string;
          user_edited_fields: string[];
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          code?: string | null;
          color?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instructor?: string | null;
          letter_scale?: Json | null;
          lms_connection_id?: string | null;
          name: string;
          target_grade?: number | null;
          term_end?: string | null;
          term_start?: string | null;
          updated_at?: string;
          user_edited_fields?: string[];
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string | null;
          color?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instructor?: string | null;
          letter_scale?: Json | null;
          lms_connection_id?: string | null;
          name?: string;
          target_grade?: number | null;
          term_end?: string | null;
          term_start?: string | null;
          updated_at?: string;
          user_edited_fields?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_lms_connection_id_fkey";
            columns: ["lms_connection_id"];
            isOneToOne: false;
            referencedRelation: "lms_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      flashcards: {
        Row: {
          assignment_id: string | null;
          back: string;
          course_id: string;
          created_at: string;
          front: string;
          id: string;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          assignment_id?: string | null;
          back: string;
          course_id: string;
          created_at?: string;
          front: string;
          id?: string;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          assignment_id?: string | null;
          back?: string;
          course_id?: string;
          created_at?: string;
          front?: string;
          id?: string;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flashcards_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignment_grade_shares";
            referencedColumns: ["assignment_id"];
          },
          {
            foreignKeyName: "flashcards_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcards_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcards_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
        ];
      };
      grade_categories: {
        Row: {
          course_id: string;
          created_at: string;
          drop_lowest: number;
          external_id: string | null;
          id: string;
          name: string;
          position: number;
          updated_at: string;
          user_edited_fields: string[];
          weight: number;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          drop_lowest?: number;
          external_id?: string | null;
          id?: string;
          name: string;
          position?: number;
          updated_at?: string;
          user_edited_fields?: string[];
          weight: number;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          drop_lowest?: number;
          external_id?: string | null;
          id?: string;
          name?: string;
          position?: number;
          updated_at?: string;
          user_edited_fields?: string[];
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "grade_categories_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_categories_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
        ];
      };
      lms_connections: {
        Row: {
          access_token_expires_at: string | null;
          access_token_secret_id: string;
          connected_at: string;
          external_user_id: string | null;
          external_user_name: string | null;
          id: string;
          institution_id: string;
          last_error: string | null;
          last_synced_at: string | null;
          refresh_token_secret_id: string | null;
          status: Database["public"]["Enums"]["lms_connection_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_token_expires_at?: string | null;
          access_token_secret_id: string;
          connected_at?: string;
          external_user_id?: string | null;
          external_user_name?: string | null;
          id?: string;
          institution_id: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          refresh_token_secret_id?: string | null;
          status?: Database["public"]["Enums"]["lms_connection_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_token_expires_at?: string | null;
          access_token_secret_id?: string;
          connected_at?: string;
          external_user_id?: string | null;
          external_user_name?: string | null;
          id?: string;
          institution_id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          refresh_token_secret_id?: string | null;
          status?: Database["public"]["Enums"]["lms_connection_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lms_connections_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "lms_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lms_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lms_dismissed_items: {
        Row: {
          connection_id: string;
          dismissed_at: string;
          external_id: string;
          item_type: string;
        };
        Insert: {
          connection_id: string;
          dismissed_at?: string;
          external_id: string;
          item_type: string;
        };
        Update: {
          connection_id?: string;
          dismissed_at?: string;
          external_id?: string;
          item_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lms_dismissed_items_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "lms_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      lms_institutions: {
        Row: {
          base_url: string;
          client_id: string;
          client_secret_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          name: string;
          provider: Database["public"]["Enums"]["lms_provider"];
        };
        Insert: {
          base_url: string;
          client_id: string;
          client_secret_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name: string;
          provider?: Database["public"]["Enums"]["lms_provider"];
        };
        Update: {
          base_url?: string;
          client_id?: string;
          client_secret_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          provider?: Database["public"]["Enums"]["lms_provider"];
        };
        Relationships: [];
      };
      lms_oauth_states: {
        Row: {
          expires_at: string;
          institution_id: string;
          state_hash: string;
          user_id: string;
        };
        Insert: {
          expires_at?: string;
          institution_id: string;
          state_hash: string;
          user_id: string;
        };
        Update: {
          expires_at?: string;
          institution_id?: string;
          state_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lms_oauth_states_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "lms_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lms_oauth_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_dedupe: {
        Row: {
          assignment_id: string | null;
          created_at: string;
          dedupe_key: string;
          kind: string | null;
          suppressed: boolean;
          user_id: string;
        };
        Insert: {
          assignment_id?: string | null;
          created_at?: string;
          dedupe_key: string;
          kind?: string | null;
          suppressed?: boolean;
          user_id: string;
        };
        Update: {
          assignment_id?: string | null;
          created_at?: string;
          dedupe_key?: string;
          kind?: string | null;
          suppressed?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_dedupe_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_log: {
        Row: {
          assignment_id: string | null;
          body: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          dedupe_key: string;
          error: string | null;
          id: number;
          kind: Database["public"]["Enums"]["notification_kind"];
          provider_message_id: string | null;
          receipt_checked_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          title: string | null;
          token_id: string | null;
          user_id: string;
        };
        Insert: {
          assignment_id?: string | null;
          body?: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key: string;
          error?: string | null;
          id?: never;
          kind: Database["public"]["Enums"]["notification_kind"];
          provider_message_id?: string | null;
          receipt_checked_at?: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          title?: string | null;
          token_id?: string | null;
          user_id: string;
        };
        Update: {
          assignment_id?: string | null;
          body?: string | null;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key?: string;
          error?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["notification_kind"];
          provider_message_id?: string | null;
          receipt_checked_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title?: string | null;
          token_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignment_grade_shares";
            referencedColumns: ["assignment_id"];
          },
          {
            foreignKeyName: "notification_log_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_token_id_fkey";
            columns: ["token_id"];
            isOneToOne: false;
            referencedRelation: "notification_tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          created_at: string;
          daily_cap: number;
          email_digest_enabled: boolean;
          exam_countdown: boolean;
          morning_digest: boolean;
          morning_digest_time: string;
          push_enabled: boolean;
          quiet_hours_enabled: boolean;
          quiet_hours_end: string;
          quiet_hours_start: string;
          remind_24h: boolean;
          remind_2h: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          daily_cap?: number;
          email_digest_enabled?: boolean;
          exam_countdown?: boolean;
          morning_digest?: boolean;
          morning_digest_time?: string;
          push_enabled?: boolean;
          quiet_hours_enabled?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          remind_24h?: boolean;
          remind_2h?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          daily_cap?: number;
          email_digest_enabled?: boolean;
          exam_countdown?: boolean;
          morning_digest?: boolean;
          morning_digest_time?: string;
          push_enabled?: boolean;
          quiet_hours_enabled?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          remind_24h?: boolean;
          remind_2h?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_tokens: {
        Row: {
          app_version: string | null;
          created_at: string;
          device_id: string | null;
          id: string;
          invalidated_at: string | null;
          last_seen_at: string;
          platform: string;
          provider: Database["public"]["Enums"]["push_provider"];
          token: string;
          updated_at: string;
          user_id: string;
          web_push_keys: Json | null;
        };
        Insert: {
          app_version?: string | null;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          invalidated_at?: string | null;
          last_seen_at?: string;
          platform: string;
          provider: Database["public"]["Enums"]["push_provider"];
          token: string;
          updated_at?: string;
          user_id?: string;
          web_push_keys?: Json | null;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          invalidated_at?: string | null;
          last_seen_at?: string;
          platform?: string;
          provider?: Database["public"]["Enums"]["push_provider"];
          token?: string;
          updated_at?: string;
          user_id?: string;
          web_push_keys?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          joined_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          share_focus_hours: boolean;
          sharing_changed_at: string | null;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["organization_role"];
          share_focus_hours?: boolean;
          sharing_changed_at?: string | null;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["organization_role"];
          share_focus_hours?: boolean;
          sharing_changed_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          join_code: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          join_code?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          join_code?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          calendar_token_hash: string | null;
          created_at: string;
          daily_study_minutes: number;
          display_name: string | null;
          id: string;
          plan_tier: Database["public"]["Enums"]["plan_tier"];
          school: string | null;
          study_minutes_by_weekday: number[] | null;
          study_start_time: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          calendar_token_hash?: string | null;
          created_at?: string;
          daily_study_minutes?: number;
          display_name?: string | null;
          id: string;
          plan_tier?: Database["public"]["Enums"]["plan_tier"];
          school?: string | null;
          study_minutes_by_weekday?: number[] | null;
          study_start_time?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          calendar_token_hash?: string | null;
          created_at?: string;
          daily_study_minutes?: number;
          display_name?: string | null;
          id?: string;
          plan_tier?: Database["public"]["Enums"]["plan_tier"];
          school?: string | null;
          study_minutes_by_weekday?: number[] | null;
          study_start_time?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      replan_requests: {
        Row: {
          reason: string | null;
          requested_at: string;
          user_id: string;
        };
        Insert: {
          reason?: string | null;
          requested_at?: string;
          user_id: string;
        };
        Update: {
          reason?: string | null;
          requested_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "replan_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_blocks: {
        Row: {
          assignment_id: string | null;
          completed_at: string | null;
          course_id: string;
          created_at: string;
          duration_minutes: number | null;
          ends_at: string;
          id: string;
          kind: Database["public"]["Enums"]["study_block_kind"];
          locked: boolean;
          rescheduled_from: string | null;
          source: string;
          starts_at: string;
          status: Database["public"]["Enums"]["study_block_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assignment_id?: string | null;
          completed_at?: string | null;
          course_id: string;
          created_at?: string;
          duration_minutes?: number | null;
          ends_at: string;
          id?: string;
          kind?: Database["public"]["Enums"]["study_block_kind"];
          locked?: boolean;
          rescheduled_from?: string | null;
          source?: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["study_block_status"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          assignment_id?: string | null;
          completed_at?: string | null;
          course_id?: string;
          created_at?: string;
          duration_minutes?: number | null;
          ends_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["study_block_kind"];
          locked?: boolean;
          rescheduled_from?: string | null;
          source?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["study_block_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_blocks_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignment_grade_shares";
            referencedColumns: ["assignment_id"];
          },
          {
            foreignKeyName: "study_blocks_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_blocks_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_blocks_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
          {
            foreignKeyName: "study_blocks_rescheduled_from_fkey";
            columns: ["rescheduled_from"];
            isOneToOne: false;
            referencedRelation: "study_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_blocks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_plan_alerts: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          kind: string;
          local_date: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind?: string;
          local_date: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind?: string;
          local_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_plan_alerts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_sessions: {
        Row: {
          assignment_id: string | null;
          course_id: string;
          created_at: string;
          duration_minutes: number | null;
          ended_at: string | null;
          id: string;
          notes: string | null;
          source: string;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assignment_id?: string | null;
          course_id: string;
          created_at?: string;
          duration_minutes?: number | null;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          source?: string;
          started_at: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          assignment_id?: string | null;
          course_id?: string;
          created_at?: string;
          duration_minutes?: number | null;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          source?: string;
          started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_sessions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignment_grade_shares";
            referencedColumns: ["assignment_id"];
          },
          {
            foreignKeyName: "study_sessions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_sessions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_sessions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
          {
            foreignKeyName: "study_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          grace_period_ends_at: string | null;
          id: string;
          product_id: string | null;
          provider: Database["public"]["Enums"]["billing_provider"];
          provider_customer_id: string | null;
          provider_subscription_id: string;
          provider_updated_at: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          store: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          grace_period_ends_at?: string | null;
          id?: string;
          product_id?: string | null;
          provider: Database["public"]["Enums"]["billing_provider"];
          provider_customer_id?: string | null;
          provider_subscription_id: string;
          provider_updated_at?: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          store?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          grace_period_ends_at?: string | null;
          id?: string;
          product_id?: string | null;
          provider?: Database["public"]["Enums"]["billing_provider"];
          provider_customer_id?: string | null;
          provider_subscription_id?: string;
          provider_updated_at?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          store?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      syllabus_uploads: {
        Row: {
          ai_usage: Json;
          course_id: string | null;
          created_at: string;
          error: string | null;
          extracted_text: string | null;
          extraction_method: Database["public"]["Enums"]["syllabus_extraction_method"] | null;
          file_path: string | null;
          id: string;
          mime_type: string | null;
          model: string | null;
          original_filename: string | null;
          page_count: number | null;
          parse_result: Json | null;
          parsed_at: string | null;
          prompt_version: string | null;
          size_bytes: number | null;
          source: Database["public"]["Enums"]["syllabus_source"];
          source_url: string | null;
          status: Database["public"]["Enums"]["syllabus_upload_status"];
          term_end_hint: string | null;
          term_start_hint: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_usage?: Json;
          course_id?: string | null;
          created_at?: string;
          error?: string | null;
          extracted_text?: string | null;
          extraction_method?: Database["public"]["Enums"]["syllabus_extraction_method"] | null;
          file_path?: string | null;
          id?: string;
          mime_type?: string | null;
          model?: string | null;
          original_filename?: string | null;
          page_count?: number | null;
          parse_result?: Json | null;
          parsed_at?: string | null;
          prompt_version?: string | null;
          size_bytes?: number | null;
          source: Database["public"]["Enums"]["syllabus_source"];
          source_url?: string | null;
          status?: Database["public"]["Enums"]["syllabus_upload_status"];
          term_end_hint?: string | null;
          term_start_hint?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          ai_usage?: Json;
          course_id?: string | null;
          created_at?: string;
          error?: string | null;
          extracted_text?: string | null;
          extraction_method?: Database["public"]["Enums"]["syllabus_extraction_method"] | null;
          file_path?: string | null;
          id?: string;
          mime_type?: string | null;
          model?: string | null;
          original_filename?: string | null;
          page_count?: number | null;
          parse_result?: Json | null;
          parsed_at?: string | null;
          prompt_version?: string | null;
          size_bytes?: number | null;
          source?: Database["public"]["Enums"]["syllabus_source"];
          source_url?: string | null;
          status?: Database["public"]["Enums"]["syllabus_upload_status"];
          term_end_hint?: string | null;
          term_start_hint?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "syllabus_uploads_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "syllabus_uploads_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
          {
            foreignKeyName: "syllabus_uploads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      assignment_grade_shares: {
        Row: {
          assignment_id: string | null;
          course_id: string | null;
          grade_share: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "weekly_focus_by_course";
            referencedColumns: ["course_id"];
          },
        ];
      };
      weekly_focus_by_course: {
        Row: {
          course_code: string | null;
          course_id: string | null;
          course_name: string | null;
          current_grade: number | null;
          current_letter: string | null;
          focus_minutes: number | null;
          session_count: number | null;
          user_id: string | null;
          week_start: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      apply_billing_event: {
        Args: {
          p_event_created_at: string;
          p_event_id: string;
          p_event_type: string;
          p_provider: Database["public"]["Enums"]["billing_provider"];
          p_subscription?: Json;
        };
        Returns: string;
      };
      billing_status: { Args: never; Returns: Json };
      claim_reminders: {
        Args: {
          p_daily_cap: number;
          p_reminders: Json;
          p_timezone: string;
          p_user_id: string;
        };
        Returns: string[];
      };
      commit_parsed_syllabus: {
        Args: { p_payload?: Json; p_upload_id: string };
        Returns: string;
      };
      course_current_grade: { Args: { p_course_id: string }; Returns: number };
      create_organization: {
        Args: { p_name: string };
        Returns: {
          join_code: string;
          organization_id: string;
        }[];
      };
      default_task_minutes: {
        Args: { p_kind: Database["public"]["Enums"]["assignment_kind"] };
        Returns: number;
      };
      email_digest_batch: {
        Args: { p_after?: string; p_limit?: number; p_now: string };
        Returns: {
          assignments: Json;
          digest_time: string;
          display_name: string;
          email: string;
          timezone: string;
          user_id: string;
        }[];
      };
      get_parse_quota: {
        Args: never;
        Returns: {
          allowed_sources: Database["public"]["Enums"]["syllabus_source"][];
          daily_limit: number;
          ocr_allowed: boolean;
          plan_tier: Database["public"]["Enums"]["plan_tier"];
          remaining: number;
          used_today: number;
        }[];
      };
      get_today_feed: {
        Args: { p_date?: string };
        Returns: {
          assignment_id: string;
          capacity_minutes: number;
          course_id: string;
          course_name: string;
          due_at: string;
          grade_share: number;
          kind: Database["public"]["Enums"]["assignment_kind"];
          minutes_remaining: number;
          overdue: boolean;
          planned_minutes: number;
          priority: number;
          rank: number;
          status: Database["public"]["Enums"]["assignment_status"];
          studied_minutes: number;
          title: string;
        }[];
      };
      invalidate_push_tokens: {
        Args: { p_token_ids: string[] };
        Returns: number;
      };
      is_pro: { Args: { p_user_id: string }; Returns: boolean };
      is_valid_letter_scale: { Args: { scale: Json }; Returns: boolean };
      is_valid_timezone: { Args: { tz: string }; Returns: boolean };
      join_organization: { Args: { p_join_code: string }; Returns: string };
      leave_organization: {
        Args: { p_organization_id: string };
        Returns: undefined;
      };
      letter_for: {
        Args: { p_percent: number; p_scale?: Json };
        Returns: string;
      };
      lms_apply_canvas_sync: {
        Args: { p_connection_id: string; p_courses: Json };
        Returns: Json;
      };
      lms_begin_oauth: {
        Args: {
          p_institution_id: string;
          p_state_hash: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      lms_connection_credentials: {
        Args: { p_connection_id: string };
        Returns: {
          access_token: string;
          access_token_expires_at: string;
          base_url: string;
          client_id: string;
          client_secret: string;
          connection_id: string;
          refresh_token: string;
          status: Database["public"]["Enums"]["lms_connection_status"];
          user_id: string;
        }[];
      };
      lms_connections_due: {
        Args: { p_limit?: number; p_stale?: string };
        Returns: {
          connection_id: string;
          user_id: string;
        }[];
      };
      lms_consume_oauth_state: {
        Args: { p_state_hash: string };
        Returns: {
          institution_id: string;
          user_id: string;
        }[];
      };
      lms_disconnect: { Args: { p_connection_id: string }; Returns: boolean };
      lms_institution_client: {
        Args: { p_institution_id: string };
        Returns: {
          base_url: string;
          client_id: string;
          client_secret: string;
          id: string;
          name: string;
        }[];
      };
      lms_mark_needs_reauth: {
        Args: { p_connection_id: string; p_error: string };
        Returns: undefined;
      };
      lms_record_sync_error: {
        Args: { p_connection_id: string; p_error: string };
        Returns: undefined;
      };
      lms_register_institution: {
        Args: {
          p_base_url: string;
          p_client_id: string;
          p_client_secret: string;
          p_name: string;
        };
        Returns: string;
      };
      lms_save_connection: {
        Args: {
          p_access_token: string;
          p_expires_at?: string;
          p_external_user_id?: string;
          p_external_user_name?: string;
          p_institution_id: string;
          p_refresh_token?: string;
          p_user_id: string;
        };
        Returns: string;
      };
      lms_update_tokens: {
        Args: {
          p_access_token: string;
          p_connection_id: string;
          p_expires_at?: string;
          p_refresh_token?: string;
        };
        Returns: undefined;
      };
      mark_missed_blocks: {
        Args: { p_before?: string };
        Returns: {
          done: number;
          missed: number;
          user_id: string;
        }[];
      };
      org_focus_summary: {
        Args: { p_organization_id: string; p_weeks?: number };
        Returns: {
          focus_hours: number;
          students_counted: number;
          suppressed: boolean;
          week_start: string;
        }[];
      };
      organization_roster: {
        Args: { p_organization_id: string };
        Returns: {
          display_name: string;
          joined_at: string;
          role: Database["public"]["Enums"]["organization_role"];
          share_focus_hours: boolean;
          user_id: string;
        }[];
      };
      parse_entitlements: {
        Args: { p_user_id: string };
        Returns: {
          ocr_allowed: boolean;
          plan_tier: Database["public"]["Enums"]["plan_tier"];
        }[];
      };
      register_push_token: {
        Args: {
          p_app_version?: string;
          p_device_id?: string;
          p_platform: string;
          p_provider: Database["public"]["Enums"]["push_provider"];
          p_token: string;
          p_web_push_keys?: Json;
        };
        Returns: string;
      };
      reminder_batch: {
        Args: { p_after?: string; p_limit?: number; p_now: string };
        Returns: {
          assignments: Json;
          prefs: Json;
          timezone: string;
          user_id: string;
        }[];
      };
      replace_review_plan: {
        Args: {
          p_assignment_ids: string[];
          p_blocks: Json;
          p_from: string;
          p_user_id: string;
        };
        Returns: number;
      };
      replace_study_plan: {
        Args: { p_blocks: Json; p_from: string; p_user_id: string };
        Returns: number;
      };
      revoke_calendar_token: { Args: never; Returns: undefined };
      rotate_calendar_token: { Args: never; Returns: string };
      rotate_join_code: { Args: { p_organization_id: string }; Returns: string };
      set_focus_sharing: {
        Args: { p_organization_id: string; p_share: boolean };
        Returns: undefined;
      };
      set_plan_alerts: {
        Args: { p_alerts: Json; p_from: string; p_user_id: string };
        Returns: undefined;
      };
      start_study_session: {
        Args: {
          p_assignment_id?: string;
          p_course_id: string;
          p_id: string;
          p_started_at?: string;
        };
        Returns: {
          assignment_id: string | null;
          course_id: string;
          created_at: string;
          duration_minutes: number | null;
          ended_at: string | null;
          id: string;
          notes: string | null;
          source: string;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "study_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      stop_study_session: {
        Args: { p_ended_at?: string; p_id: string };
        Returns: {
          assignment_id: string | null;
          course_id: string;
          created_at: string;
          duration_minutes: number | null;
          ended_at: string | null;
          id: string;
          notes: string | null;
          source: string;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "study_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      study_capacity: {
        Args: { p_date: string; p_user_id: string };
        Returns: number;
      };
      task_priority: {
        Args: {
          p_daily_minutes?: number;
          p_due_at: string;
          p_grade_share: number;
          p_minutes_remaining: number;
          p_now: string;
          p_status: Database["public"]["Enums"]["assignment_status"];
        };
        Returns: number;
      };
      unregister_push_token: {
        Args: {
          p_provider: Database["public"]["Enums"]["push_provider"];
          p_token: string;
        };
        Returns: undefined;
      };
      unsubscribe_email_digest: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      users_due_for_replan: {
        Args: { p_local_hour?: number; p_now?: string };
        Returns: {
          timezone: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      assignment_kind:
        "assignment" | "quiz" | "exam" | "project" | "reading" | "lab" | "discussion" | "other";
      assignment_status: "todo" | "in_progress" | "done" | "skipped";
      billing_provider: "stripe" | "revenuecat";
      lms_connection_status: "active" | "needs_reauth" | "revoked";
      lms_provider: "canvas";
      notification_channel: "expo" | "web_push" | "email";
      notification_kind:
        | "due_24h"
        | "due_2h"
        | "exam_countdown"
        | "morning_digest"
        | "email_digest"
        | "overload_warning";
      notification_status: "sent" | "failed" | "skipped";
      organization_role: "admin" | "student";
      plan_tier: "free" | "pro";
      push_provider: "expo" | "web_push";
      study_block_kind: "study" | "exam_prep" | "review";
      study_block_status: "planned" | "done" | "missed";
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "in_grace"
        | "paused"
        | "canceled"
        | "expired"
        | "refunded";
      syllabus_extraction_method: "text_layer" | "ocr" | "pasted" | "url";
      syllabus_source: "pdf" | "image" | "text" | "url";
      syllabus_upload_status: "pending" | "processing" | "parsed" | "committed" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assignment_kind: [
        "assignment",
        "quiz",
        "exam",
        "project",
        "reading",
        "lab",
        "discussion",
        "other",
      ],
      assignment_status: ["todo", "in_progress", "done", "skipped"],
      billing_provider: ["stripe", "revenuecat"],
      lms_connection_status: ["active", "needs_reauth", "revoked"],
      lms_provider: ["canvas"],
      notification_channel: ["expo", "web_push", "email"],
      notification_kind: [
        "due_24h",
        "due_2h",
        "exam_countdown",
        "morning_digest",
        "email_digest",
        "overload_warning",
      ],
      notification_status: ["sent", "failed", "skipped"],
      organization_role: ["admin", "student"],
      plan_tier: ["free", "pro"],
      push_provider: ["expo", "web_push"],
      study_block_kind: ["study", "exam_prep", "review"],
      study_block_status: ["planned", "done", "missed"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "in_grace",
        "paused",
        "canceled",
        "expired",
        "refunded",
      ],
      syllabus_extraction_method: ["text_layer", "ocr", "pasted", "url"],
      syllabus_source: ["pdf", "image", "text", "url"],
      syllabus_upload_status: ["pending", "processing", "parsed", "committed", "failed"],
    },
  },
} as const;
