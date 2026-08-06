
-- 1. Canonical training dataset view (decision-time features + matured label only)
CREATE OR REPLACE VIEW public.ml_training_dataset_v3 AS
SELECT
  e.id AS example_id,
  e.ticker,
  COALESCE(e.historical_date, e.checked_date_et::date) AS decision_date,
  e.checked_at,
  e.training_source,
  e.feature_version,
  e.dataset_version,
  e.pipeline_version,
  e.sector,
  e.industry,
  e.market_regime_label,
  -- decision-time numeric features
  e.current_price,
  e.market_cap,
  e.one_session_return_pct,
  e.seven_session_return_pct,
  e.twenty_session_return_pct,
  e.volume_strength,
  e.technical_score,
  e.risk_reward,
  e.volatility_score,
  e.distance_from_support_pct,
  e.distance_to_resistance_pct,
  e.upside_vs_risk,
  e.peer_count,
  e.peer_confirmation_score,
  e.analyst_buy_count,
  e.analyst_hold_count,
  e.analyst_sell_count,
  e.analyst_score,
  e.target_upside_pct,
  e.exa_result_count,
  e.exa_positive_signal_count,
  e.exa_negative_signal_count,
  e.exa_neutral_signal_count,
  e.exa_source_quality_score,
  e.confidence_score,
  e.gap_to_selected,
  -- decision-time boolean features
  e.overbought_flag,
  e.weak_volume_flag,
  e.high_volatility_flag,
  e.near_resistance_flag,
  e.extended_flag,
  e.target_supports_trade,
  e.finnhub_available,
  e.near_miss,
  e.has_revenue_growth_signal,
  e.has_raised_outlook_signal,
  e.has_earnings_beat_signal,
  e.has_analyst_upgrade_signal,
  e.has_price_target_raise_signal,
  e.has_fda_approval_signal,
  e.has_contract_win_signal,
  e.has_partnership_signal,
  e.has_lawsuit_signal,
  e.has_material_lawsuit_signal,
  e.has_investigation_signal,
  e.has_downgrade_signal,
  e.has_earnings_miss_signal,
  e.has_guidance_cut_signal,
  e.has_high_valuation_signal,
  e.has_insider_selling_signal,
  e.has_cash_burn_signal,
  e.has_margin_pressure_signal,
  -- decision-time categorical features
  e.entry_status,
  e.momentum_status,
  e.volume_confirmation,
  e.analyst_signal,
  e.confidence,
  e.status_at_check,
  e.selection_blocker,
  -- baselines (never used as model features)
  e.rule_based_final_score AS baseline_rule_score,
  e.final_swing_score AS baseline_final_score,
  e.was_selected AS baseline_was_selected,
  -- data quality
  e.data_quality_flags,
  -- targets (future information; label only)
  o.label_10_session,
  o.outcome_10_session,
  o.return_pct_current,
  o.max_gain_pct,
  o.max_drawdown_pct,
  o.sessions_elapsed,
  CASE WHEN o.label_10_session = 'positive' THEN 1
       WHEN o.label_10_session IN ('negative','flat') THEN 0
       ELSE NULL END AS target_10_session,
  (o.label_10_session IS NOT NULL AND o.label_10_session <> 'pending') AS label_matured
FROM public.swing_training_examples e
LEFT JOIN public.swing_training_outcomes o ON o.training_example_id = e.id;

GRANT SELECT ON public.ml_training_dataset_v3 TO service_role;

-- 2. Training job tracking
CREATE TABLE IF NOT EXISTS public.ml_training_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued',
  trigger_source text NOT NULL DEFAULT 'manual',
  dataset_version text,
  label_horizon text NOT NULL DEFAULT '10_session',
  train_start date,
  train_end date,
  val_start date,
  val_end date,
  test_start date,
  test_end date,
  purge_days integer,
  embargo_days integer,
  total_rows integer,
  matured_rows integer,
  train_rows integer,
  val_rows integer,
  test_rows integer,
  positive_rate numeric,
  best_model text,
  github_run_url text,
  logs text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ml_training_jobs TO authenticated;
GRANT ALL ON public.ml_training_jobs TO service_role;
ALTER TABLE public.ml_training_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read training jobs" ON public.ml_training_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access a WHERE a.user_id = auth.uid() AND a.enabled));

CREATE TRIGGER ml_training_jobs_touch BEFORE UPDATE ON public.ml_training_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend model registry (reuse existing trained_models / model_versions / model_metrics)
ALTER TABLE public.model_versions
  ADD COLUMN IF NOT EXISTS training_job_id uuid REFERENCES public.ml_training_jobs(id),
  ADD COLUMN IF NOT EXISTS algorithm text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS label_horizon text,
  ADD COLUMN IF NOT EXISTS dataset_version text,
  ADD COLUMN IF NOT EXISTS feature_version text,
  ADD COLUMN IF NOT EXISTS feature_order jsonb,
  ADD COLUMN IF NOT EXISTS preprocessing jsonb,
  ADD COLUMN IF NOT EXISTS artifact jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb,
  ADD COLUMN IF NOT EXISTS baseline_comparison jsonb,
  ADD COLUMN IF NOT EXISTS feature_importance jsonb,
  ADD COLUMN IF NOT EXISTS train_window daterange,
  ADD COLUMN IF NOT EXISTS test_window daterange,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_by uuid,
  ADD COLUMN IF NOT EXISTS is_immutable boolean NOT NULL DEFAULT true;

GRANT SELECT ON public.model_versions TO authenticated;
GRANT SELECT ON public.trained_models TO authenticated;
GRANT SELECT ON public.model_metrics TO authenticated;

CREATE POLICY "Owners can read model versions" ON public.model_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access a WHERE a.user_id = auth.uid() AND a.enabled));
CREATE POLICY "Owners can read trained models" ON public.trained_models
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access a WHERE a.user_id = auth.uid() AND a.enabled));
CREATE POLICY "Owners can read model metrics" ON public.model_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access a WHERE a.user_id = auth.uid() AND a.enabled));

-- 4. Promotion audit trail
CREATE TABLE IF NOT EXISTS public.ml_model_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid NOT NULL REFERENCES public.model_versions(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ml_model_promotions TO authenticated;
GRANT ALL ON public.ml_model_promotions TO service_role;
ALTER TABLE public.ml_model_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read promotions" ON public.ml_model_promotions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access a WHERE a.user_id = auth.uid() AND a.enabled));

-- 5. Shadow prediction support
ALTER TABLE public.prediction_history
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'shadow',
  ADD COLUMN IF NOT EXISTS training_example_id uuid REFERENCES public.swing_training_examples(id);

CREATE INDEX IF NOT EXISTS idx_prediction_history_mv ON public.prediction_history(model_version_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON public.model_versions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_training_jobs_started ON public.ml_training_jobs(started_at DESC);
