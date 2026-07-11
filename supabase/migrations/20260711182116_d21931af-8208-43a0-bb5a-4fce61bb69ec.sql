
ALTER TABLE public.swing_trade_checked_tickers
  ADD COLUMN IF NOT EXISTS selection_blocker text,
  ADD COLUMN IF NOT EXISTS near_miss boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gap_to_selected numeric;

ALTER TABLE public.swing_training_examples
  ADD COLUMN IF NOT EXISTS selection_blocker text,
  ADD COLUMN IF NOT EXISTS near_miss boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gap_to_selected numeric;

CREATE INDEX IF NOT EXISTS swing_training_examples_selection_blocker_idx
  ON public.swing_training_examples (selection_blocker) WHERE selection_blocker IS NOT NULL;

DROP VIEW IF EXISTS public.swing_ml_training_dataset_v1;
CREATE VIEW public.swing_ml_training_dataset_v1
WITH (security_invoker = true) AS
SELECT
  e.id, e.ticker, e.company, e.checked_at, e.checked_date_et, e.provider,
  e.was_selected, e.status_at_check, e.selection_blocker, e.near_miss, e.gap_to_selected,
  e.best_window, e.selected_window,
  e.current_price, e.market_cap, e.analyst_signal,
  e.one_session_return_pct, e.seven_session_return_pct, e.twenty_session_return_pct,
  e.volume_strength, e.upside_vs_risk, e.entry_status,
  e.technical_score, e.risk_reward,
  e.overbought_flag, e.weak_volume_flag, e.high_volatility_flag, e.extended_flag,
  e.exa_result_count, e.exa_positive_signal_count, e.exa_negative_signal_count,
  e.has_material_lawsuit_signal, e.has_generic_lawsuit_noise,
  e.finnhub_available, e.sector, e.industry, e.peer_count,
  e.peer_confirmation_score, e.analyst_buy_count, e.analyst_hold_count, e.analyst_sell_count,
  e.analyst_score, e.target_mean, e.target_upside_pct, e.target_supports_trade,
  e.rule_based_final_score, e.confidence, e.rejection_reason, e.final_swing_score,
  o.sessions_elapsed, o.return_pct_current, o.max_gain_pct, o.max_drawdown_pct,
  o.target_hit, o.stop_hit,
  o.label_3_session, o.label_10_session, o.label_20_session, o.label_40_session, o.final_label
FROM public.swing_training_examples e
LEFT JOIN public.swing_training_outcomes o ON o.training_example_id = e.id;

GRANT SELECT ON public.swing_ml_training_dataset_v1 TO authenticated, service_role;
