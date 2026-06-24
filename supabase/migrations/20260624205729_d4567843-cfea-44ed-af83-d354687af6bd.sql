
-- =========================================================================
-- 1. portfolio_positions  (user-owned, soft-delete)
-- =========================================================================
CREATE TABLE public.portfolio_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  ticker          text NOT NULL,
  shares          numeric(20, 8) NOT NULL CHECK (shares > 0),
  average_cost    numeric(20, 4) NULL CHECK (average_cost IS NULL OR average_cost > 0),
  purchase_date   date NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);

GRANT SELECT, INSERT, UPDATE ON public.portfolio_positions TO authenticated;
GRANT ALL ON public.portfolio_positions TO service_role;

ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own positions"
  ON public.portfolio_positions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own positions"
  ON public.portfolio_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own positions"
  ON public.portfolio_positions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE policy: soft-delete only via deleted_at.

CREATE UNIQUE INDEX portfolio_positions_user_ticker_active_uidx
  ON public.portfolio_positions (user_id, ticker)
  WHERE deleted_at IS NULL;

CREATE INDEX portfolio_positions_user_created_idx
  ON public.portfolio_positions (user_id, created_at DESC);

CREATE TRIGGER portfolio_positions_set_updated_at
  BEFORE UPDATE ON public.portfolio_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================================
-- 2. user_portfolio_settings  (user-owned, single row per user)
-- =========================================================================
CREATE TABLE public.user_portfolio_settings (
  user_id                    uuid PRIMARY KEY,
  default_save_holdings      boolean NOT NULL DEFAULT true,
  concentration_thresholds   jsonb NOT NULL DEFAULT
    '{"normal":10,"moderate":20,"high":35,"very_high":50}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_portfolio_settings TO authenticated;
GRANT ALL ON public.user_portfolio_settings TO service_role;

ALTER TABLE public.user_portfolio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own portfolio settings"
  ON public.user_portfolio_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own portfolio settings"
  ON public.user_portfolio_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own portfolio settings"
  ON public.user_portfolio_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_portfolio_settings_set_updated_at
  BEFORE UPDATE ON public.user_portfolio_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================================
-- 3. portfolio_research_requests
-- =========================================================================
CREATE TABLE public.portfolio_research_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','rate_limited')),
  attempts               integer NOT NULL DEFAULT 0,
  trigger_type           text NOT NULL DEFAULT 'web_form'
    CHECK (trigger_type IN ('web_form','email_link_then_confirm')),
  holdings_count         integer NULL,
  peer_count             integer NULL,
  cash_balance           numeric(20, 2) NULL CHECK (cash_balance IS NULL OR cash_balance >= 0),
  concentration_basis    text NOT NULL DEFAULT 'submitted_only'
    CHECK (concentration_basis IN ('submitted_only','account_total')),
  final_decision_status  text NULL,
  confidence             text NULL CHECK (confidence IS NULL OR confidence IN ('Low','Medium','High')),
  email_sent             boolean NOT NULL DEFAULT false,
  error_summary          text NULL,
  started_at             timestamptz NULL,
  completed_at           timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_research_requests TO authenticated;
GRANT ALL ON public.portfolio_research_requests TO service_role;

ALTER TABLE public.portfolio_research_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own research requests"
  ON public.portfolio_research_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated; service role handles writes.

CREATE UNIQUE INDEX portfolio_research_requests_one_active_per_user_uidx
  ON public.portfolio_research_requests (user_id)
  WHERE status IN ('pending','running');

CREATE INDEX portfolio_research_requests_user_created_idx
  ON public.portfolio_research_requests (user_id, created_at DESC);

CREATE INDEX portfolio_research_requests_status_created_idx
  ON public.portfolio_research_requests (status, created_at);


-- =========================================================================
-- 4. portfolio_research_request_items  (frozen snapshot)
-- =========================================================================
CREATE TABLE public.portfolio_research_request_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           uuid NOT NULL REFERENCES public.portfolio_research_requests(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL,  -- denormalized for RLS
  ticker               text NOT NULL,
  shares               numeric(20, 8) NOT NULL,
  average_cost         numeric(20, 4) NULL,
  purchase_date        date NULL,
  market_price         numeric(20, 4) NULL,
  market_value         numeric(20, 2) NULL,
  unrealized_pl        numeric(20, 2) NULL,
  unrealized_pl_pct    numeric(10, 4) NULL,
  weight_pct           numeric(10, 4) NULL,
  concentration_level  text NULL,
  price_condition      text NULL,
  support_condition    text NULL,
  peer_condition       text NULL,
  position_status      text NULL,
  data_sources         jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_research_request_items TO authenticated;
GRANT ALL ON public.portfolio_research_request_items TO service_role;

ALTER TABLE public.portfolio_research_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own request items"
  ON public.portfolio_research_request_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No write policies for authenticated; service role handles writes.

CREATE INDEX portfolio_research_request_items_request_idx
  ON public.portfolio_research_request_items (request_id);

CREATE INDEX portfolio_research_request_items_user_created_idx
  ON public.portfolio_research_request_items (user_id, created_at DESC);


-- =========================================================================
-- 5. agent_runs  (audit log, no monetary values)
-- =========================================================================
CREATE TABLE public.agent_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES public.portfolio_research_requests(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL,  -- denormalized for RLS
  tools_attempted        jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_succeeded        jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_data_summary   jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_decision_status  text NULL,
  confidence             text NULL CHECK (confidence IS NULL OR confidence IN ('Low','Medium','High')),
  email_sent             boolean NOT NULL DEFAULT false,
  started_at             timestamptz NULL,
  completed_at           timestamptz NULL,
  safe_error_summary     text NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own agent runs"
  ON public.agent_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No write policies for authenticated; service role handles writes.

CREATE INDEX agent_runs_request_idx
  ON public.agent_runs (request_id);

CREATE INDEX agent_runs_user_created_idx
  ON public.agent_runs (user_id, created_at DESC);
