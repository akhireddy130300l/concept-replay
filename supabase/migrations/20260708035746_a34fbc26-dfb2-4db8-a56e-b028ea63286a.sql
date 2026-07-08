
-- 1) Provider cache (Finnhub structured data)
CREATE TABLE public.stock_provider_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  ticker TEXT NOT NULL,
  cache_type TEXT NOT NULL,
  data_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, ticker, cache_type)
);
CREATE INDEX stock_provider_cache_lookup_idx ON public.stock_provider_cache (provider, ticker, cache_type, expires_at);
GRANT ALL ON public.stock_provider_cache TO service_role;
ALTER TABLE public.stock_provider_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider cache service only" ON public.stock_provider_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER stock_provider_cache_touch BEFORE UPDATE ON public.stock_provider_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Training examples (per-checked-ticker feature snapshot)
CREATE TABLE public.swing_training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  run_id UUID NULL,
  ticker TEXT NOT NULL,
  company TEXT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_date_et TEXT NULL,
  provider TEXT NULL,
  was_selected BOOLEAN NOT NULL DEFAULT false,
  status_at_check TEXT NULL,
  best_window TEXT NULL,
  selected_window TEXT NULL,
  current_price NUMERIC NULL,
  market_cap NUMERIC NULL,
  analyst_signal TEXT NULL,

  -- Yahoo technicals
  one_session_return_pct NUMERIC NULL,
  seven_session_return_pct NUMERIC NULL,
  twenty_session_return_pct NUMERIC NULL,
  volume_strength NUMERIC NULL,
  volume_confirmation TEXT NULL,
  momentum_status TEXT NULL,
  lower_watch_area NUMERIC NULL,
  upper_watch_area NUMERIC NULL,
  upside_vs_risk NUMERIC NULL,
  entry_status TEXT NULL,
  technical_score NUMERIC NULL,
  risk_reward NUMERIC NULL,
  volatility_score NUMERIC NULL,
  distance_from_support_pct NUMERIC NULL,
  distance_to_resistance_pct NUMERIC NULL,
  overbought_flag BOOLEAN NULL,
  weak_volume_flag BOOLEAN NULL,
  high_volatility_flag BOOLEAN NULL,
  near_resistance_flag BOOLEAN NULL,
  extended_flag BOOLEAN NULL,

  -- Exa news
  exa_query TEXT NULL,
  exa_result_count INTEGER NULL,
  exa_positive_signal_count INTEGER NULL,
  exa_negative_signal_count INTEGER NULL,
  exa_neutral_signal_count INTEGER NULL,
  exa_source_quality_score NUMERIC NULL,
  catalyst_summary TEXT NULL,
  key_risks JSONB NULL,
  has_revenue_growth_signal BOOLEAN NULL,
  has_raised_outlook_signal BOOLEAN NULL,
  has_earnings_beat_signal BOOLEAN NULL,
  has_analyst_upgrade_signal BOOLEAN NULL,
  has_price_target_raise_signal BOOLEAN NULL,
  has_fda_approval_signal BOOLEAN NULL,
  has_contract_win_signal BOOLEAN NULL,
  has_partnership_signal BOOLEAN NULL,
  has_lawsuit_signal BOOLEAN NULL,
  has_material_lawsuit_signal BOOLEAN NULL,
  has_generic_lawsuit_noise BOOLEAN NULL,
  has_investigation_signal BOOLEAN NULL,
  has_downgrade_signal BOOLEAN NULL,
  has_earnings_miss_signal BOOLEAN NULL,
  has_guidance_cut_signal BOOLEAN NULL,
  has_high_valuation_signal BOOLEAN NULL,
  has_insider_selling_signal BOOLEAN NULL,
  has_cash_burn_signal BOOLEAN NULL,
  has_margin_pressure_signal BOOLEAN NULL,

  -- Finnhub
  finnhub_available BOOLEAN NULL,
  sector TEXT NULL,
  industry TEXT NULL,
  peer_count INTEGER NULL,
  peer_confirmation_score NUMERIC NULL,
  analyst_buy_count INTEGER NULL,
  analyst_hold_count INTEGER NULL,
  analyst_sell_count INTEGER NULL,
  analyst_score NUMERIC NULL,
  target_mean NUMERIC NULL,
  target_upside_pct NUMERIC NULL,
  target_supports_trade BOOLEAN NULL,

  -- Rule/model
  rule_based_final_score NUMERIC NULL,
  confidence TEXT NULL,
  rejection_reason TEXT NULL,
  learning_bonus NUMERIC NULL,
  learning_penalty NUMERIC NULL,
  final_swing_score NUMERIC NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX swing_training_examples_ticker_idx ON public.swing_training_examples (ticker, checked_at DESC);
CREATE INDEX swing_training_examples_user_idx ON public.swing_training_examples (user_id, checked_at DESC);
CREATE INDEX swing_training_examples_recent_idx ON public.swing_training_examples (checked_at DESC);
GRANT SELECT ON public.swing_training_examples TO authenticated;
GRANT ALL ON public.swing_training_examples TO service_role;
ALTER TABLE public.swing_training_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training examples own read" ON public.swing_training_examples
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "training examples service all" ON public.swing_training_examples
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER swing_training_examples_touch BEFORE UPDATE ON public.swing_training_examples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Training outcomes
CREATE TABLE public.swing_training_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_example_id UUID NOT NULL REFERENCES public.swing_training_examples(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  outcome_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sessions_elapsed INTEGER NULL,
  price_at_check NUMERIC NULL,
  current_price NUMERIC NULL,
  max_high_since_check NUMERIC NULL,
  min_low_since_check NUMERIC NULL,
  return_pct_current NUMERIC NULL,
  max_gain_pct NUMERIC NULL,
  max_drawdown_pct NUMERIC NULL,
  target_hit BOOLEAN NULL,
  stop_hit BOOLEAN NULL,
  outcome_3_session NUMERIC NULL,
  outcome_10_session NUMERIC NULL,
  outcome_20_session NUMERIC NULL,
  outcome_40_session NUMERIC NULL,
  label_3_session TEXT NULL,
  label_10_session TEXT NULL,
  label_20_session TEXT NULL,
  label_40_session TEXT NULL,
  final_label TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_example_id)
);
CREATE INDEX swing_training_outcomes_ticker_idx ON public.swing_training_outcomes (ticker, checked_at DESC);
GRANT SELECT ON public.swing_training_outcomes TO authenticated;
GRANT ALL ON public.swing_training_outcomes TO service_role;
ALTER TABLE public.swing_training_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training outcomes own read" ON public.swing_training_outcomes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.swing_training_examples e
      WHERE e.id = swing_training_outcomes.training_example_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "training outcomes service all" ON public.swing_training_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER swing_training_outcomes_touch BEFORE UPDATE ON public.swing_training_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
