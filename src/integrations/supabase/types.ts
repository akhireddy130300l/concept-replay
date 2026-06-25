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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          completed_at: string | null
          confidence: string | null
          created_at: string
          email_sent: boolean
          final_decision_status: string | null
          id: string
          missing_data_summary: Json
          request_id: string
          safe_error_summary: string | null
          started_at: string | null
          tools_attempted: Json
          tools_succeeded: Json
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          confidence?: string | null
          created_at?: string
          email_sent?: boolean
          final_decision_status?: string | null
          id?: string
          missing_data_summary?: Json
          request_id: string
          safe_error_summary?: string | null
          started_at?: string | null
          tools_attempted?: Json
          tools_succeeded?: Json
          user_id: string
        }
        Update: {
          completed_at?: string | null
          confidence?: string | null
          created_at?: string
          email_sent?: boolean
          final_decision_status?: string | null
          id?: string
          missing_data_summary?: Json
          request_id?: string
          safe_error_summary?: string | null
          started_at?: string | null
          tools_attempted?: Json
          tools_succeeded?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "portfolio_research_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_topics: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_daily: boolean | null
          learned_date: string
          next_revision_date: string
          revision_count: number | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_daily?: boolean | null
          learned_date?: string
          next_revision_date: string
          revision_count?: number | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_daily?: boolean | null
          learned_date?: string
          next_revision_date?: string
          revision_count?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_feature_access: {
        Row: {
          created_at: string
          enabled: boolean
          report_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          report_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          report_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_positions: {
        Row: {
          average_cost: number | null
          created_at: string
          deleted_at: string | null
          id: string
          purchase_date: string | null
          shares: number
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          average_cost?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          purchase_date?: string | null
          shares: number
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          average_cost?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          purchase_date?: string | null
          shares?: number
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_research_request_items: {
        Row: {
          average_cost: number | null
          concentration_level: string | null
          created_at: string
          data_sources: Json
          id: string
          market_price: number | null
          market_value: number | null
          missing_data: Json
          peer_condition: string | null
          position_status: string | null
          price_condition: string | null
          purchase_date: string | null
          request_id: string
          shares: number
          support_condition: string | null
          ticker: string
          unrealized_pl: number | null
          unrealized_pl_pct: number | null
          user_id: string
          weight_pct: number | null
        }
        Insert: {
          average_cost?: number | null
          concentration_level?: string | null
          created_at?: string
          data_sources?: Json
          id?: string
          market_price?: number | null
          market_value?: number | null
          missing_data?: Json
          peer_condition?: string | null
          position_status?: string | null
          price_condition?: string | null
          purchase_date?: string | null
          request_id: string
          shares: number
          support_condition?: string | null
          ticker: string
          unrealized_pl?: number | null
          unrealized_pl_pct?: number | null
          user_id: string
          weight_pct?: number | null
        }
        Update: {
          average_cost?: number | null
          concentration_level?: string | null
          created_at?: string
          data_sources?: Json
          id?: string
          market_price?: number | null
          market_value?: number | null
          missing_data?: Json
          peer_condition?: string | null
          position_status?: string | null
          price_condition?: string | null
          purchase_date?: string | null
          request_id?: string
          shares?: number
          support_condition?: string | null
          ticker?: string
          unrealized_pl?: number | null
          unrealized_pl_pct?: number | null
          user_id?: string
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_research_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "portfolio_research_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_research_requests: {
        Row: {
          attempts: number
          cash_balance: number | null
          completed_at: string | null
          concentration_basis: string
          confidence: string | null
          created_at: string
          email_sent: boolean
          error_summary: string | null
          final_decision_status: string | null
          holdings_count: number | null
          id: string
          peer_count: number | null
          started_at: string | null
          status: string
          trigger_type: string
          user_id: string
        }
        Insert: {
          attempts?: number
          cash_balance?: number | null
          completed_at?: string | null
          concentration_basis?: string
          confidence?: string | null
          created_at?: string
          email_sent?: boolean
          error_summary?: string | null
          final_decision_status?: string | null
          holdings_count?: number | null
          id?: string
          peer_count?: number | null
          started_at?: string | null
          status?: string
          trigger_type?: string
          user_id: string
        }
        Update: {
          attempts?: number
          cash_balance?: number | null
          completed_at?: string | null
          concentration_basis?: string
          confidence?: string | null
          created_at?: string
          email_sent?: boolean
          error_summary?: string | null
          final_decision_status?: string | null
          holdings_count?: number | null
          id?: string
          peer_count?: number | null
          started_at?: string | null
          status?: string
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_responses: {
        Row: {
          answered_at: string
          correct_answer: string
          id: string
          is_correct: boolean
          question: string
          selected_answer: string
          topic_id: string
          user_id: string
        }
        Insert: {
          answered_at?: string
          correct_answer: string
          id?: string
          is_correct: boolean
          question: string
          selected_answer: string
          topic_id: string
          user_id: string
        }
        Update: {
          answered_at?: string
          correct_answer?: string
          id?: string
          is_correct?: boolean
          question?: string
          selected_answer?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "learned_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_portfolio_settings: {
        Row: {
          concentration_thresholds: Json
          created_at: string
          default_save_holdings: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          concentration_thresholds?: Json
          created_at?: string
          default_save_holdings?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          concentration_thresholds?: Json
          created_at?: string
          default_save_holdings?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          reminder_hour: number
          reminder_minute: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reminder_hour?: number
          reminder_minute?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          reminder_hour?: number
          reminder_minute?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_rewards: {
        Row: {
          correct_answers: number
          created_at: string
          current_streak: number
          id: string
          last_quiz_date: string | null
          last_topic_date: string | null
          longest_streak: number
          longest_topic_streak: number
          rank: string
          topic_streak: number
          total_points: number
          total_quizzes: number
          updated_at: string
          user_id: string
          wrong_answers: number
        }
        Insert: {
          correct_answers?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_quiz_date?: string | null
          last_topic_date?: string | null
          longest_streak?: number
          longest_topic_streak?: number
          rank?: string
          topic_streak?: number
          total_points?: number
          total_quizzes?: number
          updated_at?: string
          user_id: string
          wrong_answers?: number
        }
        Update: {
          correct_answers?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_quiz_date?: string | null
          last_topic_date?: string | null
          longest_streak?: number
          longest_topic_streak?: number
          rank?: string
          topic_streak?: number
          total_points?: number
          total_quizzes?: number
          updated_at?: string
          user_id?: string
          wrong_answers?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cron_secret: { Args: never; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
