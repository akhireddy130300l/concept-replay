
CREATE TABLE public.user_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  reminder_hour INTEGER NOT NULL DEFAULT 9 CHECK (reminder_hour BETWEEN 0 AND 23),
  reminder_minute INTEGER NOT NULL DEFAULT 0 CHECK (reminder_minute BETWEEN 0 AND 59),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences" ON public.user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own preferences" ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own preferences" ON public.user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
