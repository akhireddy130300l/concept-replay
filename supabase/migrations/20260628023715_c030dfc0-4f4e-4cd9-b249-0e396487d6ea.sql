
CREATE TABLE public.speaking_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  mode TEXT NOT NULL,
  scenario_title TEXT NOT NULL,
  scenario_prompt TEXT NOT NULL,
  transcript TEXT NOT NULL,
  feedback JSONB,
  is_recovery BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_speaking_sessions_user_date ON public.speaking_sessions(user_id, session_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaking_sessions TO authenticated;
GRANT ALL ON public.speaking_sessions TO service_role;
ALTER TABLE public.speaking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own speaking sessions"
  ON public.speaking_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.speaking_user_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_mode TEXT,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  missed_count INTEGER NOT NULL DEFAULT 0,
  last_completed_date DATE,
  paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaking_user_state TO authenticated;
GRANT ALL ON public.speaking_user_state TO service_role;
ALTER TABLE public.speaking_user_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own speaking state"
  ON public.speaking_user_state FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_speaking_state_updated
  BEFORE UPDATE ON public.speaking_user_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
