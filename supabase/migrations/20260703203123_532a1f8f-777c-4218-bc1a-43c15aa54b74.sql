-- Swing Trader Watch storage. Backend-only (service role); no public access.

CREATE TABLE public.swing_trade_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_run_id text,
  run_date date NOT NULL,
  model_used text NOT NULL,
  unique_tickers_checked int NOT NULL DEFAULT 0,
  total_selected int NOT NULL DEFAULT 0,
  total_rejected int NOT NULL DEFAULT 0,
  total_watch_only int NOT NULL DEFAULT 0,
  total_failed int NOT NULL DEFAULT 0,
  final_status text NOT NULL DEFAULT 'no_candidate',
  selected_ticker text,
  selected_company text,
  selected_price numeric,
  entry_zone_low numeric,
  entry_zone_high numeric,
  target_zone_low numeric,
  target_zone_high numeric,
  stop_loss numeric,
  holding_window text,
  risk_reward numeric,
  confidence text,
  setup_type text,
  catalyst_summary text,
  peer_context text,
  industry_context text,
  key_risks jsonb,
  invalidation text,
  source_timestamp timestamptz,
  elapsed_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.swing_trade_runs TO service_role;
ALTER TABLE public.swing_trade_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.swing_trade_runs FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX swing_trade_runs_run_date_idx ON public.swing_trade_runs (run_date DESC);

CREATE TABLE public.swing_trade_checked_tickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.swing_trade_runs(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  company text,
  source_tables jsonb,
  technical_score numeric,
  news_score numeric,
  peer_score numeric,
  industry_score numeric,
  risk_score numeric,
  final_score numeric,
  status text NOT NULL,
  checks_completed jsonb,
  latest_catalyst text,
  peer_context text,
  industry_context text,
  key_risks jsonb,
  red_flags jsonb,
  rejection_reason text,
  confidence text,
  sources_json jsonb,
  model_used text,
  elapsed_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.swing_trade_checked_tickers TO service_role;
ALTER TABLE public.swing_trade_checked_tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.swing_trade_checked_tickers FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX swing_trade_checked_tickers_run_idx ON public.swing_trade_checked_tickers (run_id);

CREATE TABLE public.swing_ticker_cache (
  ticker text NOT NULL,
  trading_date date NOT NULL,
  model text NOT NULL,
  source_type text NOT NULL DEFAULT 'swing_deep_check',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, trading_date, model, source_type)
);

GRANT ALL ON public.swing_ticker_cache TO service_role;
ALTER TABLE public.swing_ticker_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.swing_ticker_cache FOR ALL USING (false) WITH CHECK (false);
