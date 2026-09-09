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
      backtest_equity_curve: {
        Row: {
          backtest_run_id: string | null
          cash: number | null
          created_at: string
          curve_date: string
          drawdown: number | null
          equity_curve: Json | null
          id: string
          portfolio_value: number
          shares: Json | null
        }
        Insert: {
          backtest_run_id?: string | null
          cash?: number | null
          created_at?: string
          curve_date: string
          drawdown?: number | null
          equity_curve?: Json | null
          id?: string
          portfolio_value: number
          shares?: Json | null
        }
        Update: {
          backtest_run_id?: string | null
          cash?: number | null
          created_at?: string
          curve_date?: string
          drawdown?: number | null
          equity_curve?: Json | null
          id?: string
          portfolio_value?: number
          shares?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_equity_curve_backtest_run_id_fkey"
            columns: ["backtest_run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          config: Json
          created_at: string
          dataset_version: string
          end_date: string
          feature_version: string
          final_portfolio_value: number | null
          id: string
          initial_cash: number
          max_drawdown: number | null
          name: string
          sharpe_ratio: number | null
          start_date: string
          status: string
          strategy_version: string
          total_return_pct: number | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dataset_version?: string
          end_date: string
          feature_version?: string
          final_portfolio_value?: number | null
          id?: string
          initial_cash?: number
          max_drawdown?: number | null
          name: string
          sharpe_ratio?: number | null
          start_date: string
          status?: string
          strategy_version: string
          total_return_pct?: number | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dataset_version?: string
          end_date?: string
          feature_version?: string
          final_portfolio_value?: number | null
          id?: string
          initial_cash?: number
          max_drawdown?: number | null
          name?: string
          sharpe_ratio?: number | null
          start_date?: string
          status?: string
          strategy_version?: string
          total_return_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      historical_replay_chunk_scores: {
        Row: {
          chunk_index: number
          created_at: string
          id: string
          metrics: Json
          replay_date: string
          run_id: string
          score: number
          ticker: string
        }
        Insert: {
          chunk_index: number
          created_at?: string
          id?: string
          metrics?: Json
          replay_date: string
          run_id: string
          score: number
          ticker: string
        }
        Update: {
          chunk_index?: number
          created_at?: string
          id?: string
          metrics?: Json
          replay_date?: string
          run_id?: string
          score?: number
          ticker?: string
        }
        Relationships: []
      }
      historical_replay_day_logs: {
        Row: {
          created_at: string
          data_quality_events: number
          duration_ms: number | null
          error_message: string | null
          examples_created: number
          finished_at: string | null
          id: string
          metadata: Json
          outcomes_created: number
          replay_date: string
          run_id: string | null
          scored_count: number
          selected_count: number
          started_at: string
          status: string
          tickers_processed: number
          universe_count: number
          updated_at: string
          yahoo_failures: number
        }
        Insert: {
          created_at?: string
          data_quality_events?: number
          duration_ms?: number | null
          error_message?: string | null
          examples_created?: number
          finished_at?: string | null
          id?: string
          metadata?: Json
          outcomes_created?: number
          replay_date: string
          run_id?: string | null
          scored_count?: number
          selected_count?: number
          started_at?: string
          status?: string
          tickers_processed?: number
          universe_count?: number
          updated_at?: string
          yahoo_failures?: number
        }
        Update: {
          created_at?: string
          data_quality_events?: number
          duration_ms?: number | null
          error_message?: string | null
          examples_created?: number
          finished_at?: string | null
          id?: string
          metadata?: Json
          outcomes_created?: number
          replay_date?: string
          run_id?: string | null
          scored_count?: number
          selected_count?: number
          started_at?: string
          status?: string
          tickers_processed?: number
          universe_count?: number
          updated_at?: string
          yahoo_failures?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_replay_day_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "historical_replay_run_summary_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_replay_day_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "historical_training_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_training_runs: {
        Row: {
          completed_at: string | null
          config: Json | null
          consecutive_error_count: number
          created_at: string
          current_replay_date: string | null
          end_date: string
          examples_created: number
          failure_count: number
          heartbeat_at: string | null
          id: string
          last_error: string | null
          last_processed_batch: Json | null
          last_progress_at: string | null
          outcomes_created: number
          pipeline_version: string
          processed_trading_days: number
          resume_supported: boolean
          run_source: string
          start_date: string
          started_at: string
          status: string
          tickers_processed: number
          total_trading_days: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          consecutive_error_count?: number
          created_at?: string
          current_replay_date?: string | null
          end_date: string
          examples_created?: number
          failure_count?: number
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          last_processed_batch?: Json | null
          last_progress_at?: string | null
          outcomes_created?: number
          pipeline_version?: string
          processed_trading_days?: number
          resume_supported?: boolean
          run_source?: string
          start_date: string
          started_at?: string
          status?: string
          tickers_processed?: number
          total_trading_days?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          consecutive_error_count?: number
          created_at?: string
          current_replay_date?: string | null
          end_date?: string
          examples_created?: number
          failure_count?: number
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          last_processed_batch?: Json | null
          last_progress_at?: string | null
          outcomes_created?: number
          pipeline_version?: string
          processed_trading_days?: number
          resume_supported?: boolean
          run_source?: string
          start_date?: string
          started_at?: string
          status?: string
          tickers_processed?: number
          total_trading_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      law_daily_lessons: {
        Row: {
          category: string | null
          content: Json
          created_at: string
          difficulty: string | null
          english_terms: Json
          id: string
          law_name: string
          lesson_date: string
          section_ref: string | null
          sent_at: string | null
          topic_key: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content?: Json
          created_at?: string
          difficulty?: string | null
          english_terms?: Json
          id?: string
          law_name: string
          lesson_date: string
          section_ref?: string | null
          sent_at?: string | null
          topic_key: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: Json
          created_at?: string
          difficulty?: string | null
          english_terms?: Json
          id?: string
          law_name?: string
          lesson_date?: string
          section_ref?: string | null
          sent_at?: string | null
          topic_key?: string
          user_id?: string
        }
        Relationships: []
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
      market_regimes: {
        Row: {
          broad_market_label: string | null
          confidence_score: number | null
          created_at: string
          earnings_season: boolean
          fed_week: boolean
          id: string
          metadata: Json
          regime_date: string
          source: string
          spy_return_20d: number | null
          trend_label: string | null
          updated_at: string
          vix_level: number | null
          volatility_label: string | null
        }
        Insert: {
          broad_market_label?: string | null
          confidence_score?: number | null
          created_at?: string
          earnings_season?: boolean
          fed_week?: boolean
          id?: string
          metadata?: Json
          regime_date: string
          source?: string
          spy_return_20d?: number | null
          trend_label?: string | null
          updated_at?: string
          vix_level?: number | null
          volatility_label?: string | null
        }
        Update: {
          broad_market_label?: string | null
          confidence_score?: number | null
          created_at?: string
          earnings_season?: boolean
          fed_week?: boolean
          id?: string
          metadata?: Json
          regime_date?: string
          source?: string
          spy_return_20d?: number | null
          trend_label?: string | null
          updated_at?: string
          vix_level?: number | null
          volatility_label?: string | null
        }
        Relationships: []
      }
      ml_data_drift: {
        Row: {
          dataset_version: string
          drift_flag: string | null
          feature_name: string
          historical_mean: number | null
          id: string
          ks_stat: number | null
          live_mean: number | null
          measured_at: string
          psi: number | null
        }
        Insert: {
          dataset_version?: string
          drift_flag?: string | null
          feature_name: string
          historical_mean?: number | null
          id?: string
          ks_stat?: number | null
          live_mean?: number | null
          measured_at?: string
          psi?: number | null
        }
        Update: {
          dataset_version?: string
          drift_flag?: string | null
          feature_name?: string
          historical_mean?: number | null
          id?: string
          ks_stat?: number | null
          live_mean?: number | null
          measured_at?: string
          psi?: number | null
        }
        Relationships: []
      }
      ml_data_quality_log: {
        Row: {
          created_at: string
          details: Json | null
          historical_date: string | null
          id: string
          reason: string
          run_id: string | null
          ticker: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          historical_date?: string | null
          id?: string
          reason: string
          run_id?: string | null
          ticker?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          historical_date?: string | null
          id?: string
          reason?: string
          run_id?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      ml_feature_statistics: {
        Row: {
          dataset_version: string
          feature_name: string
          id: string
          importance_placeholder: number | null
          max: number | null
          mean: number | null
          min: number | null
          missing_count: number
          outlier_count: number
          sample_size: number
          std: number | null
          updated_at: string
        }
        Insert: {
          dataset_version?: string
          feature_name: string
          id?: string
          importance_placeholder?: number | null
          max?: number | null
          mean?: number | null
          min?: number | null
          missing_count?: number
          outlier_count?: number
          sample_size?: number
          std?: number | null
          updated_at?: string
        }
        Update: {
          dataset_version?: string
          feature_name?: string
          id?: string
          importance_placeholder?: number | null
          max?: number | null
          mean?: number | null
          min?: number | null
          missing_count?: number
          outlier_count?: number
          sample_size?: number
          std?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ml_model_promotions: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: string
          model_version_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          model_version_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          model_version_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_model_promotions_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_training_jobs: {
        Row: {
          best_model: string | null
          created_at: string
          dataset_version: string | null
          embargo_days: number | null
          error_message: string | null
          finished_at: string | null
          github_run_url: string | null
          id: string
          label_horizon: string
          logs: string | null
          matured_rows: number | null
          positive_rate: number | null
          purge_days: number | null
          started_at: string
          status: string
          test_end: string | null
          test_rows: number | null
          test_start: string | null
          total_rows: number | null
          train_end: string | null
          train_rows: number | null
          train_start: string | null
          trigger_source: string
          updated_at: string
          val_end: string | null
          val_rows: number | null
          val_start: string | null
        }
        Insert: {
          best_model?: string | null
          created_at?: string
          dataset_version?: string | null
          embargo_days?: number | null
          error_message?: string | null
          finished_at?: string | null
          github_run_url?: string | null
          id?: string
          label_horizon?: string
          logs?: string | null
          matured_rows?: number | null
          positive_rate?: number | null
          purge_days?: number | null
          started_at?: string
          status?: string
          test_end?: string | null
          test_rows?: number | null
          test_start?: string | null
          total_rows?: number | null
          train_end?: string | null
          train_rows?: number | null
          train_start?: string | null
          trigger_source?: string
          updated_at?: string
          val_end?: string | null
          val_rows?: number | null
          val_start?: string | null
        }
        Update: {
          best_model?: string | null
          created_at?: string
          dataset_version?: string | null
          embargo_days?: number | null
          error_message?: string | null
          finished_at?: string | null
          github_run_url?: string | null
          id?: string
          label_horizon?: string
          logs?: string | null
          matured_rows?: number | null
          positive_rate?: number | null
          purge_days?: number | null
          started_at?: string
          status?: string
          test_end?: string | null
          test_rows?: number | null
          test_start?: string | null
          total_rows?: number | null
          train_end?: string | null
          train_rows?: number | null
          train_start?: string | null
          trigger_source?: string
          updated_at?: string
          val_end?: string | null
          val_rows?: number | null
          val_start?: string | null
        }
        Relationships: []
      }
      ml_universe_russell1000: {
        Row: {
          added_at: string
          name: string | null
          sector: string | null
          ticker: string
        }
        Insert: {
          added_at?: string
          name?: string | null
          sector?: string | null
          ticker: string
        }
        Update: {
          added_at?: string
          name?: string | null
          sector?: string | null
          ticker?: string
        }
        Relationships: []
      }
      model_metrics: {
        Row: {
          created_at: string
          id: string
          metric_name: string
          metric_value: number | null
          model_version_id: string | null
          split: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_name: string
          metric_value?: number | null
          model_version_id?: string | null
          split?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_name?: string
          metric_value?: number | null
          model_version_id?: string | null
          split?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_metrics_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          algorithm: string | null
          artifact: Json | null
          baseline_comparison: Json | null
          created_at: string
          dataset_version: string | null
          feature_importance: Json | null
          feature_order: Json | null
          feature_version: string | null
          hyperparameters: Json | null
          id: string
          is_immutable: boolean
          label_horizon: string | null
          metrics: Json | null
          model_id: string | null
          notes: string | null
          preprocessing: Json | null
          promoted_at: string | null
          promoted_by: string | null
          status: string
          test_window: unknown
          train_window: unknown
          training_job_id: string | null
          version: string
        }
        Insert: {
          algorithm?: string | null
          artifact?: Json | null
          baseline_comparison?: Json | null
          created_at?: string
          dataset_version?: string | null
          feature_importance?: Json | null
          feature_order?: Json | null
          feature_version?: string | null
          hyperparameters?: Json | null
          id?: string
          is_immutable?: boolean
          label_horizon?: string | null
          metrics?: Json | null
          model_id?: string | null
          notes?: string | null
          preprocessing?: Json | null
          promoted_at?: string | null
          promoted_by?: string | null
          status?: string
          test_window?: unknown
          train_window?: unknown
          training_job_id?: string | null
          version: string
        }
        Update: {
          algorithm?: string | null
          artifact?: Json | null
          baseline_comparison?: Json | null
          created_at?: string
          dataset_version?: string | null
          feature_importance?: Json | null
          feature_order?: Json | null
          feature_version?: string | null
          hyperparameters?: Json | null
          id?: string
          is_immutable?: boolean
          label_horizon?: string | null
          metrics?: Json | null
          model_id?: string | null
          notes?: string | null
          preprocessing?: Json | null
          promoted_at?: string | null
          promoted_by?: string | null
          status?: string
          test_window?: unknown
          train_window?: unknown
          training_job_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_versions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "trained_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_versions_training_job_id_fkey"
            columns: ["training_job_id"]
            isOneToOne: false
            referencedRelation: "ml_training_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      prediction_history: {
        Row: {
          actual_label: string | null
          actual_label_at: string | null
          actual_return: number | null
          confidence_score: number | null
          created_by_pipeline: string | null
          feature_store_id: string | null
          features_snapshot: Json | null
          id: string
          mode: string
          model_version: string | null
          model_version_id: string | null
          predicted_at: string
          predicted_label: string | null
          predicted_probability: number | null
          prediction_date: string | null
          probability: number | null
          ticker: string | null
          training_example_id: string | null
          why_prediction: Json | null
        }
        Insert: {
          actual_label?: string | null
          actual_label_at?: string | null
          actual_return?: number | null
          confidence_score?: number | null
          created_by_pipeline?: string | null
          feature_store_id?: string | null
          features_snapshot?: Json | null
          id?: string
          mode?: string
          model_version?: string | null
          model_version_id?: string | null
          predicted_at?: string
          predicted_label?: string | null
          predicted_probability?: number | null
          prediction_date?: string | null
          probability?: number | null
          ticker?: string | null
          training_example_id?: string | null
          why_prediction?: Json | null
        }
        Update: {
          actual_label?: string | null
          actual_label_at?: string | null
          actual_return?: number | null
          confidence_score?: number | null
          created_by_pipeline?: string | null
          feature_store_id?: string | null
          features_snapshot?: Json | null
          id?: string
          mode?: string
          model_version?: string | null
          model_version_id?: string | null
          predicted_at?: string
          predicted_label?: string | null
          predicted_probability?: number | null
          prediction_date?: string | null
          probability?: number | null
          ticker?: string | null
          training_example_id?: string | null
          why_prediction?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_history_feature_store_id_fkey"
            columns: ["feature_store_id"]
            isOneToOne: false
            referencedRelation: "swing_feature_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_history_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_history_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "ml_training_dataset_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_history_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "ml_training_dataset_v3"
            referencedColumns: ["example_id"]
          },
          {
            foreignKeyName: "prediction_history_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "swing_ml_training_dataset_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_history_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "swing_training_examples"
            referencedColumns: ["id"]
          },
        ]
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
      rl_experiences: {
        Row: {
          action: Json
          created_at: string
          done: boolean
          experience_date: string | null
          feature_store_id: string | null
          id: string
          model_version: string | null
          next_state: Json | null
          pipeline_version: string
          reward: number | null
          state: Json
          ticker: string | null
          training_example_id: string | null
        }
        Insert: {
          action: Json
          created_at?: string
          done?: boolean
          experience_date?: string | null
          feature_store_id?: string | null
          id?: string
          model_version?: string | null
          next_state?: Json | null
          pipeline_version?: string
          reward?: number | null
          state: Json
          ticker?: string | null
          training_example_id?: string | null
        }
        Update: {
          action?: Json
          created_at?: string
          done?: boolean
          experience_date?: string | null
          feature_store_id?: string | null
          id?: string
          model_version?: string | null
          next_state?: Json | null
          pipeline_version?: string
          reward?: number | null
          state?: Json
          ticker?: string | null
          training_example_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rl_experiences_feature_store_id_fkey"
            columns: ["feature_store_id"]
            isOneToOne: false
            referencedRelation: "swing_feature_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rl_experiences_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "ml_training_dataset_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rl_experiences_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "ml_training_dataset_v3"
            referencedColumns: ["example_id"]
          },
          {
            foreignKeyName: "rl_experiences_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "swing_ml_training_dataset_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rl_experiences_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: false
            referencedRelation: "swing_training_examples"
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
      swing_feature_store: {
        Row: {
          api_latency_ms: Json | null
          confidence_score: number | null
          created_at: string
          current_price: number | null
          data_quality_flags: string[] | null
          dataset_version: string
          exa_negative_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_result_count: number | null
          exa_snapshot: Json | null
          feature_date: string
          feature_vector: Json
          feature_version: string
          finnhub_available: boolean | null
          finnhub_snapshot: Json | null
          id: string
          market_regime_id: string | null
          market_regime_label: string | null
          one_session_return_pct: number | null
          pipeline_version: string
          provider_status: Json | null
          provider_timestamp: string | null
          provider_version: Json | null
          seven_session_return_pct: number | null
          technical_score: number | null
          ticker: string
          training_source: string
          twenty_session_return_pct: number | null
          updated_at: string
          volume_strength: number | null
          yahoo_snapshot: Json | null
        }
        Insert: {
          api_latency_ms?: Json | null
          confidence_score?: number | null
          created_at?: string
          current_price?: number | null
          data_quality_flags?: string[] | null
          dataset_version?: string
          exa_negative_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_result_count?: number | null
          exa_snapshot?: Json | null
          feature_date: string
          feature_vector?: Json
          feature_version?: string
          finnhub_available?: boolean | null
          finnhub_snapshot?: Json | null
          id?: string
          market_regime_id?: string | null
          market_regime_label?: string | null
          one_session_return_pct?: number | null
          pipeline_version?: string
          provider_status?: Json | null
          provider_timestamp?: string | null
          provider_version?: Json | null
          seven_session_return_pct?: number | null
          technical_score?: number | null
          ticker: string
          training_source?: string
          twenty_session_return_pct?: number | null
          updated_at?: string
          volume_strength?: number | null
          yahoo_snapshot?: Json | null
        }
        Update: {
          api_latency_ms?: Json | null
          confidence_score?: number | null
          created_at?: string
          current_price?: number | null
          data_quality_flags?: string[] | null
          dataset_version?: string
          exa_negative_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_result_count?: number | null
          exa_snapshot?: Json | null
          feature_date?: string
          feature_vector?: Json
          feature_version?: string
          finnhub_available?: boolean | null
          finnhub_snapshot?: Json | null
          id?: string
          market_regime_id?: string | null
          market_regime_label?: string | null
          one_session_return_pct?: number | null
          pipeline_version?: string
          provider_status?: Json | null
          provider_timestamp?: string | null
          provider_version?: Json | null
          seven_session_return_pct?: number | null
          technical_score?: number | null
          ticker?: string
          training_source?: string
          twenty_session_return_pct?: number | null
          updated_at?: string
          volume_strength?: number | null
          yahoo_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "swing_feature_store_market_regime_id_fkey"
            columns: ["market_regime_id"]
            isOneToOne: false
            referencedRelation: "market_regimes"
            referencedColumns: ["id"]
          },
        ]
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
          api_latency_ms: Json | null
          best_window: string | null
          catalyst_summary: string | null
          checked_at: string
          checked_date_et: string | null
          commission_bps: number | null
          company: string | null
          confidence: string | null
          confidence_score: number | null
          created_at: string
          created_by_pipeline: string | null
          current_price: number | null
          data_quality_flags: string[] | null
          dataset_version: string
          distance_from_support_pct: number | null
          distance_to_resistance_pct: number | null
          entry_date: string | null
          entry_price: number | null
          entry_status: string | null
          exa_negative_signal_count: number | null
          exa_neutral_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_query: string | null
          exa_result_count: number | null
          exa_snapshot: Json | null
          exa_source_quality_score: number | null
          exit_date: string | null
          exit_price: number | null
          extended_flag: boolean | null
          feature_store_id: string | null
          feature_version: string
          final_swing_score: number | null
          finnhub_available: boolean | null
          finnhub_snapshot: Json | null
          future_return: number | null
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
          historical_date: string | null
          historical_run_id: string | null
          holding_days: number | null
          id: string
          industry: string | null
          key_risks: Json | null
          learning_bonus: number | null
          learning_penalty: number | null
          lower_watch_area: number | null
          market_cap: number | null
          market_regime_id: string | null
          market_regime_label: string | null
          momentum_status: string | null
          near_miss: boolean | null
          near_resistance_flag: boolean | null
          one_session_return_pct: number | null
          overbought_flag: boolean | null
          peer_confirmation_score: number | null
          peer_count: number | null
          pipeline_version: string
          position_size_pct: number | null
          provider: string | null
          provider_status: Json | null
          provider_timestamp: string | null
          provider_version: Json | null
          rejection_reason: string | null
          reward_drawdown: number | null
          risk_adjusted_return: number | null
          risk_reward: number | null
          rule_based_final_score: number | null
          run_id: string | null
          sector: string | null
          selected_window: string | null
          selection_blocker: string | null
          seven_session_return_pct: number | null
          slippage_bps: number | null
          split_bucket: string | null
          status_at_check: string | null
          target_mean: number | null
          target_supports_trade: boolean | null
          target_upside_pct: number | null
          technical_score: number | null
          ticker: string
          training_source: string
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
          why_prediction: Json | null
          yahoo_snapshot: Json | null
        }
        Insert: {
          analyst_buy_count?: number | null
          analyst_hold_count?: number | null
          analyst_score?: number | null
          analyst_sell_count?: number | null
          analyst_signal?: string | null
          api_latency_ms?: Json | null
          best_window?: string | null
          catalyst_summary?: string | null
          checked_at?: string
          checked_date_et?: string | null
          commission_bps?: number | null
          company?: string | null
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by_pipeline?: string | null
          current_price?: number | null
          data_quality_flags?: string[] | null
          dataset_version?: string
          distance_from_support_pct?: number | null
          distance_to_resistance_pct?: number | null
          entry_date?: string | null
          entry_price?: number | null
          entry_status?: string | null
          exa_negative_signal_count?: number | null
          exa_neutral_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_query?: string | null
          exa_result_count?: number | null
          exa_snapshot?: Json | null
          exa_source_quality_score?: number | null
          exit_date?: string | null
          exit_price?: number | null
          extended_flag?: boolean | null
          feature_store_id?: string | null
          feature_version?: string
          final_swing_score?: number | null
          finnhub_available?: boolean | null
          finnhub_snapshot?: Json | null
          future_return?: number | null
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
          historical_date?: string | null
          historical_run_id?: string | null
          holding_days?: number | null
          id?: string
          industry?: string | null
          key_risks?: Json | null
          learning_bonus?: number | null
          learning_penalty?: number | null
          lower_watch_area?: number | null
          market_cap?: number | null
          market_regime_id?: string | null
          market_regime_label?: string | null
          momentum_status?: string | null
          near_miss?: boolean | null
          near_resistance_flag?: boolean | null
          one_session_return_pct?: number | null
          overbought_flag?: boolean | null
          peer_confirmation_score?: number | null
          peer_count?: number | null
          pipeline_version?: string
          position_size_pct?: number | null
          provider?: string | null
          provider_status?: Json | null
          provider_timestamp?: string | null
          provider_version?: Json | null
          rejection_reason?: string | null
          reward_drawdown?: number | null
          risk_adjusted_return?: number | null
          risk_reward?: number | null
          rule_based_final_score?: number | null
          run_id?: string | null
          sector?: string | null
          selected_window?: string | null
          selection_blocker?: string | null
          seven_session_return_pct?: number | null
          slippage_bps?: number | null
          split_bucket?: string | null
          status_at_check?: string | null
          target_mean?: number | null
          target_supports_trade?: boolean | null
          target_upside_pct?: number | null
          technical_score?: number | null
          ticker: string
          training_source?: string
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
          why_prediction?: Json | null
          yahoo_snapshot?: Json | null
        }
        Update: {
          analyst_buy_count?: number | null
          analyst_hold_count?: number | null
          analyst_score?: number | null
          analyst_sell_count?: number | null
          analyst_signal?: string | null
          api_latency_ms?: Json | null
          best_window?: string | null
          catalyst_summary?: string | null
          checked_at?: string
          checked_date_et?: string | null
          commission_bps?: number | null
          company?: string | null
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by_pipeline?: string | null
          current_price?: number | null
          data_quality_flags?: string[] | null
          dataset_version?: string
          distance_from_support_pct?: number | null
          distance_to_resistance_pct?: number | null
          entry_date?: string | null
          entry_price?: number | null
          entry_status?: string | null
          exa_negative_signal_count?: number | null
          exa_neutral_signal_count?: number | null
          exa_positive_signal_count?: number | null
          exa_query?: string | null
          exa_result_count?: number | null
          exa_snapshot?: Json | null
          exa_source_quality_score?: number | null
          exit_date?: string | null
          exit_price?: number | null
          extended_flag?: boolean | null
          feature_store_id?: string | null
          feature_version?: string
          final_swing_score?: number | null
          finnhub_available?: boolean | null
          finnhub_snapshot?: Json | null
          future_return?: number | null
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
          historical_date?: string | null
          historical_run_id?: string | null
          holding_days?: number | null
          id?: string
          industry?: string | null
          key_risks?: Json | null
          learning_bonus?: number | null
          learning_penalty?: number | null
          lower_watch_area?: number | null
          market_cap?: number | null
          market_regime_id?: string | null
          market_regime_label?: string | null
          momentum_status?: string | null
          near_miss?: boolean | null
          near_resistance_flag?: boolean | null
          one_session_return_pct?: number | null
          overbought_flag?: boolean | null
          peer_confirmation_score?: number | null
          peer_count?: number | null
          pipeline_version?: string
          position_size_pct?: number | null
          provider?: string | null
          provider_status?: Json | null
          provider_timestamp?: string | null
          provider_version?: Json | null
          rejection_reason?: string | null
          reward_drawdown?: number | null
          risk_adjusted_return?: number | null
          risk_reward?: number | null
          rule_based_final_score?: number | null
          run_id?: string | null
          sector?: string | null
          selected_window?: string | null
          selection_blocker?: string | null
          seven_session_return_pct?: number | null
          slippage_bps?: number | null
          split_bucket?: string | null
          status_at_check?: string | null
          target_mean?: number | null
          target_supports_trade?: boolean | null
          target_upside_pct?: number | null
          technical_score?: number | null
          ticker?: string
          training_source?: string
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
          why_prediction?: Json | null
          yahoo_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_swing_training_examples_feature_store"
            columns: ["feature_store_id"]
            isOneToOne: false
            referencedRelation: "swing_feature_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_swing_training_examples_market_regime"
            columns: ["market_regime_id"]
            isOneToOne: false
            referencedRelation: "market_regimes"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "ml_training_dataset_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swing_training_outcomes_training_example_id_fkey"
            columns: ["training_example_id"]
            isOneToOne: true
            referencedRelation: "ml_training_dataset_v3"
            referencedColumns: ["example_id"]
          },
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
      trained_models: {
        Row: {
          algorithm: string | null
          artifact_url: string | null
          created_at: string
          dataset_version: string | null
          feature_version: string | null
          id: string
          name: string
          trained_at: string | null
        }
        Insert: {
          algorithm?: string | null
          artifact_url?: string | null
          created_at?: string
          dataset_version?: string | null
          feature_version?: string | null
          id?: string
          name: string
          trained_at?: string | null
        }
        Update: {
          algorithm?: string | null
          artifact_url?: string | null
          created_at?: string
          dataset_version?: string | null
          feature_version?: string | null
          id?: string
          name?: string
          trained_at?: string | null
        }
        Relationships: []
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
      historical_replay_run_summary_v1: {
        Row: {
          completed_at: string | null
          config: Json | null
          consecutive_error_count: number | null
          created_at: string | null
          current_replay_date: string | null
          days_committed: number | null
          days_failed: number | null
          end_date: string | null
          examples_committed: number | null
          examples_created: number | null
          failure_count: number | null
          heartbeat_at: string | null
          id: string | null
          last_day_finished_at: string | null
          last_error: string | null
          last_processed_batch: Json | null
          last_progress_at: string | null
          outcomes_committed: number | null
          outcomes_created: number | null
          pipeline_version: string | null
          processed_trading_days: number | null
          resume_supported: boolean | null
          run_source: string | null
          start_date: string | null
          started_at: string | null
          status: string | null
          tickers_committed: number | null
          tickers_processed: number | null
          total_trading_days: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      ml_training_committed_summary_v1: {
        Row: {
          avg_max_drawdown_pct: number | null
          avg_return_pct: number | null
          completed_10_session: number | null
          flat_count: number | null
          historical_days_saved: number | null
          historical_examples: number | null
          last_example_at: string | null
          last_outcome_at: string | null
          live_examples: number | null
          loss_count: number | null
          total_examples: number | null
          win_count: number | null
        }
        Relationships: []
      }
      ml_training_dataset_v2: {
        Row: {
          analyst_buy_count: number | null
          analyst_hold_count: number | null
          analyst_score: number | null
          analyst_sell_count: number | null
          analyst_signal: string | null
          best_window: string | null
          catalyst_summary: string | null
          checked_at: string | null
          checked_date_et: string | null
          commission_bps: number | null
          company: string | null
          confidence: string | null
          created_at: string | null
          current_price: number | null
          data_quality_flags: string[] | null
          dataset_version: string | null
          distance_from_support_pct: number | null
          distance_to_resistance_pct: number | null
          entry_date: string | null
          entry_price: number | null
          entry_status: string | null
          exa_negative_signal_count: number | null
          exa_neutral_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_query: string | null
          exa_result_count: number | null
          exa_snapshot: Json | null
          exa_source_quality_score: number | null
          exit_date: string | null
          exit_price: number | null
          extended_flag: boolean | null
          feature_version: string | null
          final_label: string | null
          final_swing_score: number | null
          finnhub_available: boolean | null
          finnhub_snapshot: Json | null
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
          historical_date: string | null
          historical_run_id: string | null
          id: string | null
          industry: string | null
          key_risks: Json | null
          label_10_session: string | null
          label_20_session: string | null
          label_3_session: string | null
          label_40_session: string | null
          learning_bonus: number | null
          learning_penalty: number | null
          lower_watch_area: number | null
          market_cap: number | null
          max_drawdown_pct: number | null
          max_gain_pct: number | null
          momentum_status: string | null
          near_miss: boolean | null
          near_resistance_flag: boolean | null
          one_session_return_pct: number | null
          outcome_10_session: number | null
          outcome_20_session: number | null
          outcome_3_session: number | null
          outcome_40_session: number | null
          overbought_flag: boolean | null
          peer_confirmation_score: number | null
          peer_count: number | null
          position_size_pct: number | null
          provider: string | null
          rejection_reason: string | null
          return_pct_current: number | null
          risk_reward: number | null
          rule_based_final_score: number | null
          run_id: string | null
          sector: string | null
          selected_window: string | null
          selection_blocker: string | null
          sessions_elapsed: number | null
          seven_session_return_pct: number | null
          slippage_bps: number | null
          split_bucket: string | null
          status_at_check: string | null
          stop_hit: boolean | null
          target_hit: boolean | null
          target_mean: number | null
          target_supports_trade: boolean | null
          target_upside_pct: number | null
          technical_score: number | null
          ticker: string | null
          training_source: string | null
          twenty_session_return_pct: number | null
          updated_at: string | null
          upper_watch_area: number | null
          upside_vs_risk: number | null
          user_id: string | null
          volatility_score: number | null
          volume_confirmation: string | null
          volume_strength: number | null
          was_selected: boolean | null
          weak_volume_flag: boolean | null
          yahoo_snapshot: Json | null
        }
        Relationships: []
      }
      ml_training_dataset_v3: {
        Row: {
          analyst_buy_count: number | null
          analyst_hold_count: number | null
          analyst_score: number | null
          analyst_sell_count: number | null
          analyst_signal: string | null
          baseline_final_score: number | null
          baseline_rule_score: number | null
          baseline_was_selected: boolean | null
          checked_at: string | null
          confidence: string | null
          confidence_score: number | null
          current_price: number | null
          data_quality_flags: string[] | null
          dataset_version: string | null
          decision_date: string | null
          distance_from_support_pct: number | null
          distance_to_resistance_pct: number | null
          entry_status: string | null
          exa_negative_signal_count: number | null
          exa_neutral_signal_count: number | null
          exa_positive_signal_count: number | null
          exa_result_count: number | null
          exa_source_quality_score: number | null
          example_id: string | null
          extended_flag: boolean | null
          feature_version: string | null
          finnhub_available: boolean | null
          gap_to_selected: number | null
          has_analyst_upgrade_signal: boolean | null
          has_cash_burn_signal: boolean | null
          has_contract_win_signal: boolean | null
          has_downgrade_signal: boolean | null
          has_earnings_beat_signal: boolean | null
          has_earnings_miss_signal: boolean | null
          has_fda_approval_signal: boolean | null
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
          industry: string | null
          label_10_session: string | null
          label_matured: boolean | null
          market_cap: number | null
          market_regime_label: string | null
          max_drawdown_pct: number | null
          max_gain_pct: number | null
          momentum_status: string | null
          near_miss: boolean | null
          near_resistance_flag: boolean | null
          one_session_return_pct: number | null
          outcome_10_session: number | null
          overbought_flag: boolean | null
          peer_confirmation_score: number | null
          peer_count: number | null
          pipeline_version: string | null
          return_pct_current: number | null
          risk_reward: number | null
          sector: string | null
          selection_blocker: string | null
          sessions_elapsed: number | null
          seven_session_return_pct: number | null
          status_at_check: string | null
          target_10_session: number | null
          target_supports_trade: boolean | null
          target_upside_pct: number | null
          technical_score: number | null
          ticker: string | null
          training_source: string | null
          twenty_session_return_pct: number | null
          upside_vs_risk: number | null
          volatility_score: number | null
          volume_confirmation: string | null
          volume_strength: number | null
          weak_volume_flag: boolean | null
        }
        Relationships: []
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
