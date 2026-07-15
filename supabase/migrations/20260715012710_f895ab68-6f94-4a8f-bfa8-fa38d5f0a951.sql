ALTER TABLE public.historical_training_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_error_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_trading_days int,
  ADD COLUMN IF NOT EXISTS processed_trading_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_processed_batch jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version text NOT NULL DEFAULT 'historical_replay_v2',
  ADD COLUMN IF NOT EXISTS run_source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_htr_status_heartbeat ON public.historical_training_runs(status, heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_htr_status_progress ON public.historical_training_runs(status, last_progress_at DESC);

CREATE TABLE IF NOT EXISTS public.historical_replay_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.historical_training_runs(id) ON DELETE CASCADE,
  replay_date date NOT NULL,
  status text NOT NULL DEFAULT 'started',
  universe_count int NOT NULL DEFAULT 0,
  scored_count int NOT NULL DEFAULT 0,
  selected_count int NOT NULL DEFAULT 0,
  examples_created int NOT NULL DEFAULT 0,
  outcomes_created int NOT NULL DEFAULT 0,
  tickers_processed int NOT NULL DEFAULT 0,
  yahoo_failures int NOT NULL DEFAULT 0,
  data_quality_events int NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, replay_date)
);
GRANT SELECT ON public.historical_replay_day_logs TO authenticated;
GRANT ALL ON public.historical_replay_day_logs TO service_role;
ALTER TABLE public.historical_replay_day_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read historical replay day logs" ON public.historical_replay_day_logs FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_hrdl_updated_at BEFORE UPDATE ON public.historical_replay_day_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hrdl_run_date ON public.historical_replay_day_logs(run_id, replay_date);
CREATE INDEX IF NOT EXISTS idx_hrdl_status ON public.historical_replay_day_logs(status, replay_date DESC);

ALTER TABLE public.swing_training_examples
  ADD COLUMN IF NOT EXISTS feature_store_id uuid,
  ADD COLUMN IF NOT EXISTS provider_version jsonb,
  ADD COLUMN IF NOT EXISTS provider_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status jsonb,
  ADD COLUMN IF NOT EXISTS api_latency_ms jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version text NOT NULL DEFAULT 'swing_pipeline_v1',
  ADD COLUMN IF NOT EXISTS created_by_pipeline text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS market_regime_id uuid,
  ADD COLUMN IF NOT EXISTS market_regime_label text,
  ADD COLUMN IF NOT EXISTS future_return numeric,
  ADD COLUMN IF NOT EXISTS risk_adjusted_return numeric,
  ADD COLUMN IF NOT EXISTS reward_drawdown numeric,
  ADD COLUMN IF NOT EXISTS holding_days int,
  ADD COLUMN IF NOT EXISTS why_prediction jsonb;

CREATE TABLE IF NOT EXISTS public.market_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_date date NOT NULL UNIQUE,
  broad_market_label text,
  volatility_label text,
  trend_label text,
  fed_week boolean NOT NULL DEFAULT false,
  earnings_season boolean NOT NULL DEFAULT false,
  spy_return_20d numeric,
  vix_level numeric,
  source text NOT NULL DEFAULT 'deterministic_rules',
  confidence_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_regimes TO authenticated;
GRANT ALL ON public.market_regimes TO service_role;
ALTER TABLE public.market_regimes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read market regimes" ON public.market_regimes FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_market_regimes_updated_at BEFORE UPDATE ON public.market_regimes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.swing_feature_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  feature_date date NOT NULL,
  feature_version text NOT NULL DEFAULT 'v1',
  dataset_version text NOT NULL DEFAULT 'dataset_v1',
  training_source text NOT NULL DEFAULT 'historical',
  pipeline_version text NOT NULL DEFAULT 'historical_replay_v2',
  provider_version jsonb,
  provider_timestamp timestamptz,
  provider_status jsonb,
  api_latency_ms jsonb,
  market_regime_id uuid REFERENCES public.market_regimes(id) ON DELETE SET NULL,
  market_regime_label text,
  current_price numeric,
  one_session_return_pct numeric,
  seven_session_return_pct numeric,
  twenty_session_return_pct numeric,
  volume_strength numeric,
  technical_score numeric,
  exa_result_count int,
  exa_positive_signal_count int,
  exa_negative_signal_count int,
  finnhub_available boolean,
  confidence_score numeric,
  feature_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  yahoo_snapshot jsonb,
  finnhub_snapshot jsonb,
  exa_snapshot jsonb,
  data_quality_flags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticker, feature_date, feature_version, dataset_version, training_source)
);
GRANT SELECT ON public.swing_feature_store TO authenticated;
GRANT ALL ON public.swing_feature_store TO service_role;
ALTER TABLE public.swing_feature_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read swing feature store" ON public.swing_feature_store FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_swing_feature_store_updated_at BEFORE UPDATE ON public.swing_feature_store
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_sfs_date ON public.swing_feature_store(feature_date DESC);
CREATE INDEX IF NOT EXISTS idx_sfs_ticker_date ON public.swing_feature_store(ticker, feature_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_swing_training_examples_feature_store'
  ) THEN
    ALTER TABLE public.swing_training_examples
      ADD CONSTRAINT fk_swing_training_examples_feature_store
      FOREIGN KEY (feature_store_id) REFERENCES public.swing_feature_store(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_swing_training_examples_market_regime'
  ) THEN
    ALTER TABLE public.swing_training_examples
      ADD CONSTRAINT fk_swing_training_examples_market_regime
      FOREIGN KEY (market_regime_id) REFERENCES public.market_regimes(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.prediction_history
  ADD COLUMN IF NOT EXISTS prediction_date date,
  ADD COLUMN IF NOT EXISTS predicted_probability numeric,
  ADD COLUMN IF NOT EXISTS actual_return numeric,
  ADD COLUMN IF NOT EXISTS actual_label_at timestamptz,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS feature_store_id uuid REFERENCES public.swing_feature_store(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS why_prediction jsonb,
  ADD COLUMN IF NOT EXISTS created_by_pipeline text;
CREATE INDEX IF NOT EXISTS idx_prediction_history_date ON public.prediction_history(prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_history_ticker_date ON public.prediction_history(ticker, prediction_date DESC);

CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  strategy_version text NOT NULL,
  dataset_version text NOT NULL DEFAULT 'dataset_v1',
  feature_version text NOT NULL DEFAULT 'v1',
  start_date date NOT NULL,
  end_date date NOT NULL,
  initial_cash numeric NOT NULL DEFAULT 100000,
  final_portfolio_value numeric,
  max_drawdown numeric,
  total_return_pct numeric,
  sharpe_ratio numeric,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.backtest_runs TO authenticated;
GRANT ALL ON public.backtest_runs TO service_role;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read backtest runs" ON public.backtest_runs FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_backtest_runs_updated_at BEFORE UPDATE ON public.backtest_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.backtest_equity_curve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id uuid REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  curve_date date NOT NULL,
  portfolio_value numeric NOT NULL,
  cash numeric,
  shares jsonb,
  drawdown numeric,
  equity_curve jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(backtest_run_id, curve_date)
);
GRANT SELECT ON public.backtest_equity_curve TO authenticated;
GRANT ALL ON public.backtest_equity_curve TO service_role;
ALTER TABLE public.backtest_equity_curve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read backtest equity curve" ON public.backtest_equity_curve FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_bec_run_date ON public.backtest_equity_curve(backtest_run_id, curve_date);

CREATE TABLE IF NOT EXISTS public.rl_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text,
  experience_date date,
  state jsonb NOT NULL,
  action jsonb NOT NULL,
  reward numeric,
  next_state jsonb,
  done boolean NOT NULL DEFAULT false,
  feature_store_id uuid REFERENCES public.swing_feature_store(id) ON DELETE SET NULL,
  training_example_id uuid REFERENCES public.swing_training_examples(id) ON DELETE SET NULL,
  model_version text,
  pipeline_version text NOT NULL DEFAULT 'rl_foundation_v1',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rl_experiences TO authenticated;
GRANT ALL ON public.rl_experiences TO service_role;
ALTER TABLE public.rl_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read rl experiences" ON public.rl_experiences FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_rl_exp_date ON public.rl_experiences(experience_date DESC);

CREATE OR REPLACE VIEW public.ml_training_committed_summary_v1
WITH (security_invoker = true) AS
SELECT
  COUNT(*)::bigint AS total_examples,
  COUNT(*) FILTER (WHERE e.training_source = 'live')::bigint AS live_examples,
  COUNT(*) FILTER (WHERE e.training_source = 'historical')::bigint AS historical_examples,
  COUNT(o.*) FILTER (WHERE o.label_10_session IS NOT NULL AND o.label_10_session <> 'pending')::bigint AS completed_10_session,
  COUNT(o.*) FILTER (WHERE o.label_10_session = 'positive')::bigint AS win_count,
  COUNT(o.*) FILTER (WHERE o.label_10_session = 'negative')::bigint AS loss_count,
  COUNT(o.*) FILTER (WHERE o.label_10_session = 'flat')::bigint AS flat_count,
  AVG(o.return_pct_current) FILTER (WHERE o.return_pct_current IS NOT NULL) AS avg_return_pct,
  AVG(o.max_drawdown_pct) FILTER (WHERE o.max_drawdown_pct IS NOT NULL) AS avg_max_drawdown_pct,
  COUNT(DISTINCT e.historical_date) FILTER (WHERE e.training_source = 'historical')::bigint AS historical_days_saved,
  MAX(e.created_at) AS last_example_at,
  MAX(o.outcome_checked_at) AS last_outcome_at
FROM public.swing_training_examples e
LEFT JOIN public.swing_training_outcomes o ON o.training_example_id = e.id;
GRANT SELECT ON public.ml_training_committed_summary_v1 TO authenticated;
GRANT ALL ON public.ml_training_committed_summary_v1 TO service_role;

CREATE OR REPLACE VIEW public.historical_replay_run_summary_v1
WITH (security_invoker = true) AS
SELECT
  r.*,
  COALESCE(day_counts.days_committed, 0)::int AS days_committed,
  COALESCE(day_counts.days_failed, 0)::int AS days_failed,
  COALESCE(day_counts.examples_committed, 0)::int AS examples_committed,
  COALESCE(day_counts.outcomes_committed, 0)::int AS outcomes_committed,
  COALESCE(day_counts.tickers_committed, 0)::int AS tickers_committed,
  day_counts.last_day_finished_at
FROM public.historical_training_runs r
LEFT JOIN (
  SELECT
    run_id,
    COUNT(*) FILTER (WHERE status = 'completed') AS days_committed,
    COUNT(*) FILTER (WHERE status = 'failed') AS days_failed,
    SUM(examples_created) FILTER (WHERE status = 'completed') AS examples_committed,
    SUM(outcomes_created) FILTER (WHERE status = 'completed') AS outcomes_committed,
    SUM(tickers_processed) FILTER (WHERE status = 'completed') AS tickers_committed,
    MAX(finished_at) AS last_day_finished_at
  FROM public.historical_replay_day_logs
  GROUP BY run_id
) day_counts ON day_counts.run_id = r.id;
GRANT SELECT ON public.historical_replay_run_summary_v1 TO authenticated;
GRANT ALL ON public.historical_replay_run_summary_v1 TO service_role;