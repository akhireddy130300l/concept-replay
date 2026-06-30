
ALTER TABLE public.speaking_user_state
  ADD COLUMN IF NOT EXISTS next_improvement_target text,
  ADD COLUMN IF NOT EXISTS last_main_weakness text,
  ADD COLUMN IF NOT EXISTS last_recovery_email_date date,
  ADD COLUMN IF NOT EXISTS speaking_gate_started_at timestamptz;

ALTER TABLE public.speaking_sessions
  ADD COLUMN IF NOT EXISTS improvement_target text,
  ADD COLUMN IF NOT EXISTS improvement_target_met text,
  ADD COLUMN IF NOT EXISTS main_weakness text,
  ADD COLUMN IF NOT EXISTS rounds jsonb;

CREATE TABLE IF NOT EXISTS public.stock_ticker_insight_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  payload jsonb NOT NULL,
  grounded boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_ticker_insight_cache_ticker_idx
  ON public.stock_ticker_insight_cache (ticker);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_ticker_insight_cache TO authenticated;
GRANT ALL ON public.stock_ticker_insight_cache TO service_role;

ALTER TABLE public.stock_ticker_insight_cache ENABLE ROW LEVEL SECURITY;

-- Only authorized users (those in portfolio_feature_access) can read cache; writes are server-side via service role.
CREATE POLICY "Authorized users can read insight cache"
  ON public.stock_ticker_insight_cache
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_feature_access pfa WHERE pfa.user_id = auth.uid()));
