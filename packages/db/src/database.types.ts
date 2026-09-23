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
          id: string;
          kind: Database["public"]["Enums"]["assignment_kind"];
          points_earned: number | null;
          points_possible: number | null;
          source: string;
          status: Database["public"]["Enums"]["assignment_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          completed_at?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          points_earned?: number | null;
          points_possible?: number | null;
          source?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          completed_at?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          points_earned?: number | null;
          points_possible?: number | null;
          source?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          title?: string;
          updated_at?: string;
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
        ];
      };
      courses: {
        Row: {
          archived_at: string | null;
          code: string | null;
          color: string | null;
          created_at: string;
          id: string;
          instructor: string | null;
          letter_scale: Json | null;
          name: string;
          target_grade: number | null;
          term_end: string | null;
          term_start: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          code?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          instructor?: string | null;
          letter_scale?: Json | null;
          name: string;
          target_grade?: number | null;
          term_end?: string | null;
          term_start?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          instructor?: string | null;
          letter_scale?: Json | null;
          name?: string;
          target_grade?: number | null;
          term_end?: string | null;
          term_start?: string | null;
          updated_at?: string;
          user_id?: string;
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
      grade_categories: {
        Row: {
          course_id: string;
          created_at: string;
          drop_lowest: number;
          id: string;
          name: string;
          position: number;
          updated_at: string;
          weight: number;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          drop_lowest?: number;
          id?: string;
          name: string;
          position?: number;
          updated_at?: string;
          weight: number;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          drop_lowest?: number;
          id?: string;
          name?: string;
          position?: number;
          updated_at?: string;
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
      profiles: {
        Row: {
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
        ];
      };
    };
    Functions: {
      commit_parsed_syllabus: {
        Args: { p_payload?: Json; p_upload_id: string };
        Returns: string;
      };
      default_task_minutes: {
        Args: { p_kind: Database["public"]["Enums"]["assignment_kind"] };
        Returns: number;
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
      is_valid_letter_scale: { Args: { scale: Json }; Returns: boolean };
      is_valid_timezone: { Args: { tz: string }; Returns: boolean };
      mark_missed_blocks: {
        Args: { p_before?: string };
        Returns: {
          done: number;
          missed: number;
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
      set_plan_alerts: {
        Args: { p_alerts: Json; p_from: string; p_user_id: string };
        Returns: undefined;
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
      notification_channel: "expo" | "web_push" | "email";
      notification_kind:
        | "due_24h"
        | "due_2h"
        | "exam_countdown"
        | "morning_digest"
        | "email_digest"
        | "overload_warning";
      notification_status: "sent" | "failed" | "skipped";
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
