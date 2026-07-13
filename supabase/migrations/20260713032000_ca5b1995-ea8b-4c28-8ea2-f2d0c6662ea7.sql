
ALTER TABLE public.swing_training_examples
  ADD COLUMN IF NOT EXISTS feature_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS dataset_version text NOT NULL DEFAULT 'dataset_v1',
  ADD COLUMN IF NOT EXISTS training_source text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS historical_run_id uuid,
  ADD COLUMN IF NOT EXISTS historical_date date,
  ADD COLUMN IF NOT EXISTS yahoo_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS finnhub_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exa_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS entry_price numeric,
  ADD COLUMN IF NOT EXISTS exit_price numeric,
  ADD COLUMN IF NOT EXISTS entry_date date,
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS commission_bps numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage_bps numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_size_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS split_bucket text,
  ADD COLUMN IF NOT EXISTS data_quality_flags text[];

CREATE INDEX IF NOT EXISTS idx_ste_training_source ON public.swing_training_examples(training_source);
CREATE INDEX IF NOT EXISTS idx_ste_historical_date ON public.swing_training_examples(historical_date);
CREATE INDEX IF NOT EXISTS idx_ste_dataset_version ON public.swing_training_examples(dataset_version);
CREATE INDEX IF NOT EXISTS idx_ste_split_bucket ON public.swing_training_examples(split_bucket);

CREATE TABLE IF NOT EXISTS public.historical_training_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  start_date date NOT NULL,
  end_date date NOT NULL,
  current_replay_date date,
  tickers_processed int NOT NULL DEFAULT 0,
  examples_created int NOT NULL DEFAULT 0,
  outcomes_created int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  resume_supported boolean NOT NULL DEFAULT true,
  config jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.historical_training_runs TO authenticated;
GRANT ALL ON public.historical_training_runs TO service_role;
ALTER TABLE public.historical_training_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read historical runs" ON public.historical_training_runs FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_htr_updated_at BEFORE UPDATE ON public.historical_training_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ml_feature_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL,
  dataset_version text NOT NULL DEFAULT 'dataset_v1',
  mean numeric,
  std numeric,
  min numeric,
  max numeric,
  missing_count int NOT NULL DEFAULT 0,
  outlier_count int NOT NULL DEFAULT 0,
  importance_placeholder numeric,
  sample_size int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_name, dataset_version)
);
GRANT SELECT ON public.ml_feature_statistics TO authenticated;
GRANT ALL ON public.ml_feature_statistics TO service_role;
ALTER TABLE public.ml_feature_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read feature stats" ON public.ml_feature_statistics FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.ml_data_drift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at timestamptz NOT NULL DEFAULT now(),
  feature_name text NOT NULL,
  dataset_version text NOT NULL DEFAULT 'dataset_v1',
  historical_mean numeric,
  live_mean numeric,
  psi numeric,
  ks_stat numeric,
  drift_flag text
);
GRANT SELECT ON public.ml_data_drift TO authenticated;
GRANT ALL ON public.ml_data_drift TO service_role;
ALTER TABLE public.ml_data_drift ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read drift" ON public.ml_data_drift FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_drift_feature ON public.ml_data_drift(feature_name, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.ml_data_quality_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  ticker text,
  historical_date date,
  reason text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ml_data_quality_log TO authenticated;
GRANT ALL ON public.ml_data_quality_log TO service_role;
ALTER TABLE public.ml_data_quality_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read quality log" ON public.ml_data_quality_log FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_dqlog_run ON public.ml_data_quality_log(run_id);

CREATE TABLE IF NOT EXISTS public.ml_universe_russell1000 (
  ticker text PRIMARY KEY,
  name text,
  sector text,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ml_universe_russell1000 TO authenticated;
GRANT ALL ON public.ml_universe_russell1000 TO service_role;
ALTER TABLE public.ml_universe_russell1000 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read universe" ON public.ml_universe_russell1000 FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.trained_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  algorithm text,
  dataset_version text,
  feature_version text,
  artifact_url text,
  trained_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trained_models TO authenticated;
GRANT ALL ON public.trained_models TO service_role;
ALTER TABLE public.trained_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read trained models" ON public.trained_models FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES public.trained_models(id) ON DELETE CASCADE,
  version text NOT NULL,
  hyperparameters jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.model_versions TO authenticated;
GRANT ALL ON public.model_versions TO service_role;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read model versions" ON public.model_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.model_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES public.model_versions(id) ON DELETE CASCADE,
  split text,
  metric_name text NOT NULL,
  metric_value numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.model_metrics TO authenticated;
GRANT ALL ON public.model_metrics TO service_role;
ALTER TABLE public.model_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read model metrics" ON public.model_metrics FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES public.model_versions(id) ON DELETE CASCADE,
  ticker text,
  predicted_at timestamptz NOT NULL DEFAULT now(),
  probability numeric,
  predicted_label text,
  actual_label text,
  features_snapshot jsonb
);
GRANT SELECT ON public.prediction_history TO authenticated;
GRANT ALL ON public.prediction_history TO service_role;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read predictions" ON public.prediction_history FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.ml_training_dataset_v2
WITH (security_invoker = true) AS
SELECT
  e.*,
  o.sessions_elapsed,
  o.return_pct_current,
  o.max_gain_pct,
  o.max_drawdown_pct,
  o.target_hit,
  o.stop_hit,
  o.outcome_3_session,
  o.outcome_10_session,
  o.outcome_20_session,
  o.outcome_40_session,
  o.label_3_session,
  o.label_10_session,
  o.label_20_session,
  o.label_40_session,
  o.final_label
FROM public.swing_training_examples e
LEFT JOIN public.swing_training_outcomes o ON o.training_example_id = e.id;

GRANT SELECT ON public.ml_training_dataset_v2 TO authenticated;
GRANT ALL ON public.ml_training_dataset_v2 TO service_role;
