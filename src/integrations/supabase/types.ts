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
      speaking_sessions: {
        Row: {
          completed_at: string
          created_at: string
          feedback: Json | null
          id: string
          improvement_target: string | null
          improvement_target_met: string | null
          is_recovery: boolean
          main_weakness: string | null
          mode: string
          rounds: Json | null
          scenario_prompt: string
          scenario_title: string
          session_date: string
          transcript: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          feedback?: Json | null
          id?: string
          improvement_target?: string | null
          improvement_target_met?: string | null
          is_recovery?: boolean
          main_weakness?: string | null
          mode: string
          rounds?: Json | null
          scenario_prompt: string
          scenario_title: string
          session_date?: string
          transcript: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          feedback?: Json | null
          id?: string
          improvement_target?: string | null
          improvement_target_met?: string | null
          is_recovery?: boolean
          main_weakness?: string | null
          mode?: string
          rounds?: Json | null
          scenario_prompt?: string
          scenario_title?: string
          session_date?: string
          transcript?: string
          user_id?: string
        }
        Relationships: []
      }
      speaking_user_state: {
        Row: {
          created_at: string
          current_streak: number
          last_completed_date: string | null
          last_main_weakness: string | null
          last_recovery_email_date: string | null
          longest_streak: number
          missed_count: number
          next_improvement_target: string | null
          paused: boolean
          preferred_mode: string | null
          speaking_gate_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          last_completed_date?: string | null
          last_main_weakness?: string | null
          last_recovery_email_date?: string | null
          longest_streak?: number
          missed_count?: number
          next_improvement_target?: string | null
          paused?: boolean
          preferred_mode?: string | null
          speaking_gate_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          last_completed_date?: string | null
          last_main_weakness?: string | null
          last_recovery_email_date?: string | null
          longest_streak?: number
          missed_count?: number
          next_improvement_target?: string | null
          paused?: boolean
          preferred_mode?: string | null
          speaking_gate_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_provider_cache: {
        Row: {
          cache_type: string
          created_at: string
          data_json: Json
          expires_at: string
          fetched_at: string
          id: string
          provider: string
          ticker: string
          updated_at: string
        }
        Insert: {
          cache_type: string
          created_at?: string
          data_json: Json
          expires_at: string
          fetched_at?: string
          id?: string
          provider: string
          ticker: string
          updated_at?: string
        }
        Update: {
          cache_type?: string
          created_at?: string
          data_json?: Json
          expires_at?: string
          fetched_at?: string
          id?: string
          provider?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_ticker_insight_cache: {
        Row: {
          created_by: string | null
          expires_at: string
          generated_at: string
          grounded: boolean
          id: string
          payload: Json
          ticker: string
        }
        Insert: {
          created_by?: string | null
          expires_at: string
          generated_at?: string
          grounded?: boolean
          id?: string
          payload: Json
          ticker: string
        }
        Update: {
          created_by?: string | null
          expires_at?: string
          generated_at?: string
          grounded?: boolean
          id?: string
          payload?: Json
          ticker?: string
        }
        Relationships: []
      }
      swing_ticker_cache: {
        Row: {
          created_at: string
          model: string
          payload: Json
          source_type: string
          ticker: string
          trading_date: string
        }
        Insert: {
          created_at?: string
          model: string
          payload: Json
          source_type?: string
          ticker: string
          trading_date: string
        }
        Update: {
          created_at?: string
          model?: string
          payload?: Json
          source_type?: string
          ticker?: string
          trading_date?: string
        }
        Relationships: []
      }
      swing_trade_checked_tickers: {
        Row: {
          checks_completed: Json | null
          company: string | null
          confidence: string | null
          created_at: string
          elapsed_ms: number | null
          final_score: number | null
          gap_to_selected: number | null
          id: string
          industry_context: string | null
          industry_score: number | null
          key_risks: Json | null
          latest_catalyst: string | null
          model_used: string | null
          near_miss: boolean | null
          news_score: number | null
          peer_context: string | null
          peer_score: number | null
          red_flags: Json | null
          rejection_reason: string | null
          risk_score: number | null
          run_id: string
          selection_blocker: string | null
          source_tables: Json | null
          sources_json: Json | null
          status: string
          technical_score: number | null
          ticker: string
        }
        Insert: {
          checks_completed?: Json | null
          company?: string | null
          confidence?: string | null
          created_at?: string
          elapsed_ms?: number | null
          final_score?: number | null
          gap_to_selected?: number | null
          id?: string
          industry_context?: string | null
          industry_score?: number | null
          key_risks?: Json | null
          latest_catalyst?: string | null
          model_used?: string | null
          near_miss?: boolean | null
          news_score?: number | null
          peer_context?: string | null
          peer_score?: number | null
          red_flags?: Json | null
          rejection_reason?: string | null
          risk_score?: number | null
          run_id: string
          selection_blocker?: string | null
          source_tables?: Json | null
          sources_json?: Json | null
          status: string
          technical_score?: number | null
          ticker: string
        }
        Update: {
          checks_completed?: Json | null
          company?: string | null
          confidence?: string | null
          created_at?: string
          elapsed_ms?: number | null
          final_score?: number | null
          gap_to_selected?: number | null
          id?: string
          industry_context?: string | null
          industry_score?: number | null
          key_risks?: Json | null
          latest_catalyst?: string | null
          model_used?: string | null
          near_miss?: boolean | null
          news_score?: number | null
          peer_context?: string | null
          peer_score?: number | null
          red_flags?: Json | null
          rejection_reason?: string | null
          risk_score?: number | null
          run_id?: string
          selection_blocker?: string | null
          source_tables?: Json | null
          sources_json?: Json | null
          status?: string
          technical_score?: number | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "swing_trade_checked_tickers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "swing_trade_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      swing_trade_runs: {
        Row: {
          catalyst_summary: string | null
          confidence: string | null
          created_at: string
          elapsed_ms: number | null
          email_run_id: string | null
          entry_zone_high: number | null
          entry_zone_low: number | null
          final_status: string
          holding_window: string | null
          id: string
          industry_context: string | null
          invalidation: string | null
          key_risks: Json | null
          model_used: string
          peer_context: string | null
          risk_reward: number | null
          run_date: string
          selected_company: string | null
          selected_price: number | null
          selected_ticker: string | null
          setup_type: string | null
          source_timestamp: string | null
          stop_loss: number | null
          target_zone_high: number | null
          target_zone_low: number | null
          total_failed: number
          total_rejected: number
          total_selected: number
          total_watch_only: number
          unique_tickers_checked: number
        }
        Insert: {
          catalyst_summary?: string | null
          confidence?: string | null
          created_at?: string
          elapsed_ms?: number | null
          email_run_id?: string | null
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          final_status?: string
          holding_window?: string | null
          id?: string
          industry_context?: string | null
          invalidation?: string | null
          key_risks?: Json | null
          model_used: string
          peer_context?: string | null
          risk_reward?: number | null
          run_date: string
          selected_company?: string | null
          selected_price?: number | null
          selected_ticker?: string | null
          setup_type?: string | null
          source_timestamp?: string | null
          stop_loss?: number | null
          target_zone_high?: number | null
          target_zone_low?: number | null
          total_failed?: number
          total_rejected?: number
          total_selected?: number
          total_watch_only?: number
          unique_tickers_checked?: number
        }
        Update: {
          catalyst_summary?: string | null
          confidence?: string | null
          created_at?: string
          elapsed_ms?: number | null
          email_run_id?: string | null
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          final_status?: string
          holding_window?: string | null
          id?: string
          industry_context?: string | null
          invalidation?: string | null
          key_risks?: Json | null
          model_used?: string
          peer_context?: string | null
          risk_reward?: number | null
          run_date?: string
          selected_company?: string | null
          selected_price?: number | null
          selected_ticker?: string | null
          setup_type?: string | null
          source_timestamp?: string | null
          stop_loss?: number | null
          target_zone_high?: number | null
          target_zone_low?: number | null
          total_failed?: number
          total_rejected?: number
          total_selected?: number
          total_watch_only?: number
          unique_tickers_checked?: number
        }
        Relationships: []
      }
      swing_training_examples: {
        Row: {
          analyst_buy_count: number | null
          analyst_hold_count: number | null
          analyst_score: number | null
          analyst_sell_count: number | null
          analyst_signal: string | null
          best_window: string | null
          catalyst_summary: string | null
          checked_at: string
          checked_date_et: string | null
          company: string | null
          confidence: string | null
          created_at: string
          current_price: number | null
          distance_from_support_pct: number | null
          distance_to_resistance_pct: number | null
          entry_status: string | null
          exa_negative_signal_count: number | null
          exa_neutral_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_query: string | null
          exa_result_count: number | null
          exa_source_quality_score: number | null
          extended_flag: boolean | null
          final_swing_score: number | null
          finnhub_available: boolean | null
          gap_to_selected: number | null
          has_analyst_upgrade_signal: boolean | null
          has_cash_burn_signal: boolean | null
          has_contract_win_signal: boolean | null
          has_downgrade_signal: boolean | null
          has_earnings_beat_signal: boolean | null
          has_earnings_miss_signal: boolean | null
          has_fda_approval_signal: boolean | null
          has_generic_lawsuit_noise: boolean | null
          has_guidance_cut_signal: boolean | null
          has_high_valuation_signal: boolean | null
          has_insider_selling_signal: boolean | null
          has_investigation_signal: boolean | null
          has_lawsuit_signal: boolean | null
          has_margin_pressure_signal: boolean | null
          has_material_lawsuit_signal: boolean | null
          has_partnership_signal: boolean | null
          has_price_target_raise_signal: boolean | null
          has_raised_outlook_signal: boolean | null
          has_revenue_growth_signal: boolean | null
          high_volatility_flag: boolean | null
          id: string
          industry: string | null
          key_risks: Json | null
          learning_bonus: number | null
          learning_penalty: number | null
          lower_watch_area: number | null
          market_cap: number | null
          momentum_status: string | null
          near_miss: boolean | null
          near_resistance_flag: boolean | null
          one_session_return_pct: number | null
          overbought_flag: boolean | null
          peer_confirmation_score: number | null
          peer_count: number | null
          provider: string | null
          rejection_reason: string | null
          risk_reward: number | null
          rule_based_final_score: number | null
          run_id: string | null
          sector: string | null
          selected_window: string | null
          selection_blocker: string | null
          seven_session_return_pct: number | null
          status_at_check: string | null
          target_mean: number | null
          target_supports_trade: boolean | null
          target_upside_pct: number | null
          technical_score: number | null
          ticker: string
          twenty_session_return_pct: number | null
          updated_at: string
          upper_watch_area: number | null
          upside_vs_risk: number | null
          user_id: string | null
          volatility_score: number | null
          volume_confirmation: string | null
          volume_strength: number | null
          was_selected: boolean
          weak_volume_flag: boolean | null
        }
        Insert: {
          analyst_buy_count?: number | null
          analyst_hold_count?: number | null
          analyst_score?: number | null
          analyst_sell_count?: number | null
          analyst_signal?: string | null
          best_window?: string | null
          catalyst_summary?: string | null
          checked_at?: string
          checked_date_et?: string | null
          company?: string | null
          confidence?: string | null
          created_at?: string
          current_price?: number | null
          distance_from_support_pct?: number | null
          distance_to_resistance_pct?: number | null
          entry_status?: string | null
          exa_negative_signal_count?: number | null
          exa_neutral_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_query?: string | null
          exa_result_count?: number | null
          exa_source_quality_score?: number | null
          extended_flag?: boolean | null
          final_swing_score?: number | null
          finnhub_available?: boolean | null
          gap_to_selected?: number | null
          has_analyst_upgrade_signal?: boolean | null
          has_cash_burn_signal?: boolean | null
          has_contract_win_signal?: boolean | null
          has_downgrade_signal?: boolean | null
          has_earnings_beat_signal?: boolean | null
          has_earnings_miss_signal?: boolean | null
          has_fda_approval_signal?: boolean | null
          has_generic_lawsuit_noise?: boolean | null
          has_guidance_cut_signal?: boolean | null
          has_high_valuation_signal?: boolean | null
          has_insider_selling_signal?: boolean | null
          has_investigation_signal?: boolean | null
          has_lawsuit_signal?: boolean | null
          has_margin_pressure_signal?: boolean | null
          has_material_lawsuit_signal?: boolean | null
          has_partnership_signal?: boolean | null
          has_price_target_raise_signal?: boolean | null
          has_raised_outlook_signal?: boolean | null
          has_revenue_growth_signal?: boolean | null
          high_volatility_flag?: boolean | null
          id?: string
          industry?: string | null
          key_risks?: Json | null
          learning_bonus?: number | null
          learning_penalty?: number | null
          lower_watch_area?: number | null
          market_cap?: number | null
          momentum_status?: string | null
          near_miss?: boolean | null
          near_resistance_flag?: boolean | null
          one_session_return_pct?: number | null
          overbought_flag?: boolean | null
          peer_confirmation_score?: number | null
          peer_count?: number | null
          provider?: string | null
          rejection_reason?: string | null
          risk_reward?: number | null
          rule_based_final_score?: number | null
          run_id?: string | null
          sector?: string | null
          selected_window?: string | null
          selection_blocker?: string | null
          seven_session_return_pct?: number | null
          status_at_check?: string | null
          target_mean?: number | null
          target_supports_trade?: boolean | null
          target_upside_pct?: number | null
          technical_score?: number | null
          ticker: string
          twenty_session_return_pct?: number | null
          updated_at?: string
          upper_watch_area?: number | null
          upside_vs_risk?: number | null
          user_id?: string | null
          volatility_score?: number | null
          volume_confirmation?: string | null
          volume_strength?: number | null
          was_selected?: boolean
          weak_volume_flag?: boolean | null
        }
        Update: {
          analyst_buy_count?: number | null
          analyst_hold_count?: number | null
          analyst_score?: number | null
          analyst_sell_count?: number | null
          analyst_signal?: string | null
          best_window?: string | null
          catalyst_summary?: string | null
          checked_at?: string
          checked_date_et?: string | null
          company?: string | null
          confidence?: string | null
          created_at?: string
          current_price?: number | null
          distance_from_support_pct?: number | null
          distance_to_resistance_pct?: number | null
          entry_status?: string | null
          exa_negative_signal_count?: number | null
          exa_neutral_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_query?: string | null
          exa_result_count?: number | null
          exa_source_quality_score?: number | null
          extended_flag?: boolean | null
          final_swing_score?: number | null
          finnhub_available?: boolean | null
          gap_to_selected?: number | null
          has_analyst_upgrade_signal?: boolean | null
          has_cash_burn_signal?: boolean | null
          has_contract_win_signal?: boolean | null
          has_downgrade_signal?: boolean | null
          has_earnings_beat_signal?: boolean | null
          has_earnings_miss_signal?: boolean | null
          has_fda_approval_signal?: boolean | null
          has_generic_lawsuit_noise?: boolean | null
          has_guidance_cut_signal?: boolean | null
          has_high_valuation_signal?: boolean | null
          has_insider_selling_signal?: boolean | null
          has_investigation_signal?: boolean | null
          has_lawsuit_signal?: boolean | null
          has_margin_pressure_signal?: boolean | null
          has_material_lawsuit_signal?: boolean | null
          has_partnership_signal?: boolean | null
          has_price_target_raise_signal?: boolean | null
          has_raised_outlook_signal?: boolean | null
          has_revenue_growth_signal?: boolean | null
          high_volatility_flag?: boolean | null
          id?: string
          industry?: string | null
          key_risks?: Json | null
          learning_bonus?: number | null
          learning_penalty?: number | null
          lower_watch_area?: number | null
          market_cap?: number | null
          momentum_status?: string | null
          near_miss?: boolean | null
          near_resistance_flag?: boolean | null
          one_session_return_pct?: number | null
          overbought_flag?: boolean | null
          peer_confirmation_score?: number | null
          peer_count?: number | null
          provider?: string | null
          rejection_reason?: string | null
          risk_reward?: number | null
          rule_based_final_score?: number | null
          run_id?: string | null
          sector?: string | null
          selected_window?: string | null
          selection_blocker?: string | null
          seven_session_return_pct?: number | null
          status_at_check?: string | null
          target_mean?: number | null
          target_supports_trade?: boolean | null
          target_upside_pct?: number | null
          technical_score?: number | null
          ticker?: string
          twenty_session_return_pct?: number | null
          updated_at?: string
          upper_watch_area?: number | null
          upside_vs_risk?: number | null
          user_id?: string | null
          volatility_score?: number | null
          volume_confirmation?: string | null
          volume_strength?: number | null
          was_selected?: boolean
          weak_volume_flag?: boolean | null
        }
        Relationships: []
      }
      swing_training_outcomes: {
        Row: {
          checked_at: string
          created_at: string
          current_price: number | null
          final_label: string | null
          id: string
          label_10_session: string | null
          label_20_session: string | null
          label_3_session: string | null
          label_40_session: string | null
          max_drawdown_pct: number | null
          max_gain_pct: number | null
          max_high_since_check: number | null
          min_low_since_check: number | null
          outcome_10_session: number | null
          outcome_20_session: number | null
          outcome_3_session: number | null
          outcome_40_session: number | null
          outcome_checked_at: string
          price_at_check: number | null
          return_pct_current: number | null
          sessions_elapsed: number | null
          stop_hit: boolean | null
          target_hit: boolean | null
          ticker: string
          training_example_id: string
          updated_at: string
        }
        Insert: {
          checked_at: string
          created_at?: string
          current_price?: number | null
          final_label?: string | null
          id?: string
          label_10_session?: string | null
          label_20_session?: string | null
          label_3_session?: string | null
          label_40_session?: string | null
          max_drawdown_pct?: number | null
          max_gain_pct?: number | null
          max_high_since_check?: number | null
          min_low_since_check?: number | null
          outcome_10_session?: number | null
          outcome_20_session?: number | null
          outcome_3_session?: number | null
          outcome_40_session?: number | null
          outcome_checked_at?: string
          price_at_check?: number | null
          return_pct_current?: number | null
          sessions_elapsed?: number | null
          stop_hit?: boolean | null
          target_hit?: boolean | null
          ticker: string
          training_example_id: string
          updated_at?: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          current_price?: number | null
          final_label?: string | null
          id?: string
          label_10_session?: string | null
          label_20_session?: string | null
          label_3_session?: string | null
          label_40_session?: string | null
          max_drawdown_pct?: number | null
          max_gain_pct?: number | null
          max_high_since_check?: number | null
          min_low_since_check?: number | null
          outcome_10_session?: number | null
          outcome_20_session?: number | null
          outcome_3_session?: number | null
          outcome_40_session?: number | null
          outcome_checked_at?: string
          price_at_check?: number | null
          return_pct_current?: number | null
          sessions_elapsed?: number | null
          stop_hit?: boolean | null
          target_hit?: boolean | null
          ticker?: string
          training_example_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swing_training_outcomes_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: true
            referencedRelation: "swing_ml_training_dataset_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swing_training_outcomes_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: true
            referencedRelation: "swing_training_examples"
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
      swing_ml_feature_quality_v1: {
        Row: {
          checked_date_et: string | null
          exa_complete_rows: number | null
          finnhub_complete_rows: number | null
          rows_missing_analyst_score: number | null
          rows_missing_final_score: number | null
          rows_missing_news_score: number | null
          rows_missing_peer_score: number | null
          rows_missing_price: number | null
          rows_missing_risk_reward: number | null
          rows_missing_risk_score: number | null
          rows_missing_volume_strength: number | null
          total_rows: number | null
          yahoo_complete_rows: number | null
        }
        Relationships: []
      }
      swing_ml_readiness_summary_v1: {
        Row: {
          completed_10_session: number | null
          completed_20_session: number | null
          completed_3_session: number | null
          completed_40_session: number | null
          distinct_tickers: number | null
          earliest_example_date: string | null
          flat_10_session: number | null
          flat_20_session: number | null
          flat_3_session: number | null
          flat_40_session: number | null
          latest_example_date: string | null
          negative_10_session: number | null
          negative_20_session: number | null
          negative_3_session: number | null
          negative_40_session: number | null
          passed_examples: number | null
          pending_10_session: number | null
          pending_20_session: number | null
          pending_3_session: number | null
          pending_40_session: number | null
          positive_10_session: number | null
          positive_20_session: number | null
          positive_3_session: number | null
          positive_40_session: number | null
          rejected_examples: number | null
          selected_examples: number | null
          total_outcome_rows: number | null
          total_training_examples: number | null
          watch_only_examples: number | null
        }
        Relationships: []
      }
      swing_ml_training_dataset_v1: {
        Row: {
          analyst_buy_count: number | null
          analyst_hold_count: number | null
          analyst_score: number | null
          analyst_sell_count: number | null
          analyst_signal: string | null
          best_window: string | null
          checked_at: string | null
          checked_date_et: string | null
          company: string | null
          confidence: string | null
          current_price: number | null
          entry_status: string | null
          exa_negative_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_result_count: number | null
          extended_flag: boolean | null
          final_label: string | null
          final_swing_score: number | null
          finnhub_available: boolean | null
          gap_to_selected: number | null
          has_generic_lawsuit_noise: boolean | null
          has_material_lawsuit_signal: boolean | null
          high_volatility_flag: boolean | null
          id: string | null
          industry: string | null
          label_10_session: string | null
          label_20_session: string | null
          label_3_session: string | null
          label_40_session: string | null
          market_cap: number | null
          max_drawdown_pct: number | null
          max_gain_pct: number | null
          near_miss: boolean | null
          one_session_return_pct: number | null
          overbought_flag: boolean | null
          peer_confirmation_score: number | null
          peer_count: number | null
          provider: string | null
          rejection_reason: string | null
          return_pct_current: number | null
          risk_reward: number | null
          rule_based_final_score: number | null
          sector: string | null
          selected_window: string | null
          selection_blocker: string | null
          sessions_elapsed: number | null
          seven_session_return_pct: number | null
          status_at_check: string | null
          stop_hit: boolean | null
          target_hit: boolean | null
          target_mean: number | null
          target_supports_trade: boolean | null
          target_upside_pct: number | null
          technical_score: number | null
          ticker: string | null
          twenty_session_return_pct: number | null
          upside_vs_risk: number | null
          volume_strength: number | null
          was_selected: boolean | null
          weak_volume_flag: boolean | null
        }
        Relationships: []
      }
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
