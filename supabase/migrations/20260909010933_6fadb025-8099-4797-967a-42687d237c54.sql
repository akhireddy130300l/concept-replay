CREATE TABLE IF NOT EXISTS public.historical_replay_chunk_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  replay_date date NOT NULL,
  chunk_index integer NOT NULL,
  ticker text NOT NULL,
  score numeric NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, replay_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_hrcs_run_day ON public.historical_replay_chunk_scores (run_id, replay_date, chunk_index);

GRANT SELECT ON public.historical_replay_chunk_scores TO authenticated;
GRANT ALL ON public.historical_replay_chunk_scores TO service_role;

ALTER TABLE public.historical_replay_chunk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view replay chunk scores" ON public.historical_replay_chunk_scores;
CREATE POLICY "Authenticated users can view replay chunk scores"
ON public.historical_replay_chunk_scores
FOR SELECT
TO authenticated
USING (true);