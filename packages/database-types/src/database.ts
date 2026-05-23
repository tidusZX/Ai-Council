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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      clients: {
        Row: {
          business_type: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          business_type?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          business_type?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      council_outputs: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          project_id: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload: Json
          project_id?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          project_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_outputs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_references: {
        Row: {
          captured_at: string
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          owner_id: string
          source_platform: string | null
          source_url: string | null
          tags: string[]
          thumbnail_path: string | null
          title: string | null
        }
        Insert: {
          captured_at?: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          owner_id: string
          source_platform?: string | null
          source_url?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          title?: string | null
        }
        Update: {
          captured_at?: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          owner_id?: string
          source_platform?: string | null
          source_url?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          title?: string | null
        }
        Relationships: []
      }
      creators: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          id: string
          niches: string[]
          owner_id: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          niches?: string[]
          owner_id: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          niches?: string[]
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          business_name: string
          created_at: string
          diagnosis: Json
          id: string
          ig_handle: string | null
          location: string | null
          opportunity_score: number | null
          owner_id: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          diagnosis?: Json
          id?: string
          ig_handle?: string | null
          location?: string | null
          opportunity_score?: number | null
          owner_id: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          diagnosis?: Json
          id?: string
          ig_handle?: string | null
          location?: string | null
          opportunity_score?: number | null
          owner_id?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          // round_number/addressed_to/in_reply_to are introduced by
          // migration 007 (Plan 06A). Until that migration is applied,
          // existing rows don't return these fields — treat them as
          // optional so pre-migration selects still typecheck. Read
          // sites should default round_number → 1, addressed_to → [].
          addressed_to?: string[]
          content: string
          created_at: string
          embedding: string | null
          id: string
          in_reply_to?: string | null
          is_complete: boolean
          role: string
          round_number?: number
          session_id: string
          updated_at: string
        }
        Insert: {
          addressed_to?: string[]
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          in_reply_to?: string | null
          is_complete?: boolean
          role: string
          round_number?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          addressed_to?: string[]
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          in_reply_to?: string | null
          is_complete?: boolean
          role?: string
          round_number?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_in_reply_to_fkey"
            columns: ["in_reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_logs: {
        Row: {
          channel: string
          created_at: string
          id: string
          lead_id: string
          message_body: string
          outcome: string | null
          response_at: string | null
          sent_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          lead_id: string
          message_body: string
          outcome?: string | null
          response_at?: string | null
          sent_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string
          message_body?: string
          outcome?: string | null
          response_at?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brief: string | null
          created_at: string
          id: string
          owner_id: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          brief?: string | null
          created_at?: string
          id?: string
          owner_id: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          brief?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          body: string
          category: string | null
          created_at: string
          embedding: string | null
          id: string
          model: string | null
          owner_id: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          model?: string | null
          owner_id: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          model?: string | null
          owner_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          kind: string
          owner_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          kind: string
          owner_id: string
          payload: Json
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          kind?: string
          owner_id?: string
          payload?: Json
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          prompt: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shotlists: {
        Row: {
          created_at: string
          id: string
          project_id: string
          shots: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          shots?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          shots?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shotlists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_analyses: {
        Row: {
          analysis: Json | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          keyframe_paths: Json
          owner_id: string
          raw_metadata: Json | null
          source_platform: string | null
          source_url: string
          status: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          keyframe_paths?: Json
          owner_id: string
          raw_metadata?: Json | null
          source_platform?: string | null
          source_url: string
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          keyframe_paths?: Json
          owner_id?: string
          raw_metadata?: Json | null
          source_platform?: string | null
          source_url?: string
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
