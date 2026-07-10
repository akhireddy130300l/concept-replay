
-- ML readiness summary view: aggregate counts across all four label windows.
CREATE OR REPLACE VIEW public.swing_ml_readiness_summary_v1 AS
SELECT
  (SELECT COUNT(*) FROM public.swing_training_examples) AS total_training_examples,
  (SELECT COUNT(*) FROM public.swing_training_outcomes) AS total_outcome_rows,
  COUNT(*) FILTER (WHERE o.label_3_session = 'pending')  AS pending_3_session,
  COUNT(*) FILTER (WHERE o.label_3_session IS NOT NULL AND o.label_3_session <> 'pending') AS completed_3_session,
  COUNT(*) FILTER (WHERE o.label_3_session = 'positive') AS positive_3_session,
  COUNT(*) FILTER (WHERE o.label_3_session = 'negative') AS negative_3_session,
  COUNT(*) FILTER (WHERE o.label_3_session = 'flat')     AS flat_3_session,
  COUNT(*) FILTER (WHERE o.label_10_session = 'pending') AS pending_10_session,
  COUNT(*) FILTER (WHERE o.label_10_session IS NOT NULL AND o.label_10_session <> 'pending') AS completed_10_session,
  COUNT(*) FILTER (WHERE o.label_10_session = 'positive') AS positive_10_session,
  COUNT(*) FILTER (WHERE o.label_10_session = 'negative') AS negative_10_session,
  COUNT(*) FILTER (WHERE o.label_10_session = 'flat')     AS flat_10_session,
  COUNT(*) FILTER (WHERE o.label_20_session = 'pending') AS pending_20_session,
  COUNT(*) FILTER (WHERE o.label_20_session IS NOT NULL AND o.label_20_session <> 'pending') AS completed_20_session,
  COUNT(*) FILTER (WHERE o.label_20_session = 'positive') AS positive_20_session,
  COUNT(*) FILTER (WHERE o.label_20_session = 'negative') AS negative_20_session,
  COUNT(*) FILTER (WHERE o.label_20_session = 'flat')     AS flat_20_session,
  COUNT(*) FILTER (WHERE o.label_40_session = 'pending') AS pending_40_session,
  COUNT(*) FILTER (WHERE o.label_40_session IS NOT NULL AND o.label_40_session <> 'pending') AS completed_40_session,
  COUNT(*) FILTER (WHERE o.label_40_session = 'positive') AS positive_40_session,
  COUNT(*) FILTER (WHERE o.label_40_session = 'negative') AS negative_40_session,
  COUNT(*) FILTER (WHERE o.label_40_session = 'flat')     AS flat_40_session,
  (SELECT MIN(checked_at)::date FROM public.swing_training_examples) AS earliest_example_date,
  (SELECT MAX(checked_at)::date FROM public.swing_training_examples) AS latest_example_date,
  (SELECT COUNT(DISTINCT ticker) FROM public.swing_training_examples) AS distinct_tickers,
  (SELECT COUNT(*) FROM public.swing_training_examples WHERE status_at_check = 'selected') AS selected_examples,
  (SELECT COUNT(*) FROM public.swing_training_examples WHERE status_at_check = 'rejected') AS rejected_examples,
  (SELECT COUNT(*) FROM public.swing_training_examples WHERE status_at_check = 'watch_only') AS watch_only_examples,
  (SELECT COUNT(*) FROM public.swing_training_examples WHERE status_at_check = 'passed_not_selected') AS passed_examples
FROM public.swing_training_outcomes o;

GRANT SELECT ON public.swing_ml_readiness_summary_v1 TO authenticated, service_role;

-- Feature completeness view grouped by ET check date.
CREATE OR REPLACE VIEW public.swing_ml_feature_quality_v1 AS
SELECT
  checked_date_et,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE current_price IS NOT NULL
                     AND one_session_return_pct IS NOT NULL
                     AND seven_session_return_pct IS NOT NULL
                     AND twenty_session_return_pct IS NOT NULL
                     AND volume_strength IS NOT NULL
                     AND technical_score IS NOT NULL) AS yahoo_complete_rows,
  COUNT(*) FILTER (WHERE exa_result_count IS NOT NULL
                     AND (exa_positive_signal_count IS NOT NULL OR exa_negative_signal_count IS NOT NULL)) AS exa_complete_rows,
  COUNT(*) FILTER (WHERE finnhub_available IS TRUE
                     AND peer_confirmation_score IS NOT NULL
                     AND analyst_score IS NOT NULL) AS finnhub_complete_rows,
  COUNT(*) FILTER (WHERE current_price IS NULL)          AS rows_missing_price,
  COUNT(*) FILTER (WHERE volume_strength IS NULL)         AS rows_missing_volume_strength,
  COUNT(*) FILTER (WHERE risk_reward IS NULL)             AS rows_missing_risk_reward,
  COUNT(*) FILTER (WHERE exa_positive_signal_count IS NULL AND exa_negative_signal_count IS NULL) AS rows_missing_news_score,
  COUNT(*) FILTER (WHERE key_risks IS NULL)               AS rows_missing_risk_score,
  COUNT(*) FILTER (WHERE peer_confirmation_score IS NULL) AS rows_missing_peer_score,
  COUNT(*) FILTER (WHERE analyst_score IS NULL)           AS rows_missing_analyst_score,
  COUNT(*) FILTER (WHERE final_swing_score IS NULL)       AS rows_missing_final_score
FROM public.swing_training_examples
GROUP BY checked_date_et
ORDER BY checked_date_et DESC;

GRANT SELECT ON public.swing_ml_feature_quality_v1 TO authenticated, service_role;
