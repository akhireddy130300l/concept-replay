CREATE TABLE public.opportunity_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  field text NOT NULL,
  topic text NOT NULL,
  topic_key text NOT NULL,
  why_rising text NOT NULL,
  five_year_vision text NOT NULL,
  real_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_step text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Moderate',
  cost_estimate text NOT NULL DEFAULT 'Free',
  time_estimate text NOT NULL DEFAULT '15 min',
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_wildcard boolean NOT NULL DEFAULT false,
  is_ask_anything boolean NOT NULL DEFAULT false,
  sent_for date NOT NULL DEFAULT CURRENT_DATE,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX opportunity_ideas_user_topic_key_uidx
  ON public.opportunity_ideas (user_id, topic_key)
  WHERE deleted_at IS NULL;

CREATE INDEX opportunity_ideas_user_sent_for_idx
  ON public.opportunity_ideas (user_id, sent_for DESC)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.opportunity_ideas TO authenticated;
GRANT ALL ON public.opportunity_ideas TO service_role;

ALTER TABLE public.opportunity_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own opportunity ideas"
  ON public.opportunity_ideas FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own opportunity ideas"
  ON public.opportunity_ideas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own opportunity ideas"
  ON public.opportunity_ideas FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.opportunity_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idea_id uuid NOT NULL REFERENCES public.opportunity_ideas(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('started', 'later', 'not_for_me')),
  weekly_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  check_ins jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  last_milestone_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX opportunity_actions_user_idea_uidx
  ON public.opportunity_actions (user_id, idea_id)
  WHERE deleted_at IS NULL;

CREATE INDEX opportunity_actions_started_idx
  ON public.opportunity_actions (status, started_at)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.opportunity_actions TO authenticated;
GRANT ALL ON public.opportunity_actions TO service_role;

ALTER TABLE public.opportunity_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own opportunity actions"
  ON public.opportunity_actions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own opportunity actions"
  ON public.opportunity_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own opportunity actions"
  ON public.opportunity_actions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_opportunity_actions_updated_at
  BEFORE UPDATE ON public.opportunity_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();