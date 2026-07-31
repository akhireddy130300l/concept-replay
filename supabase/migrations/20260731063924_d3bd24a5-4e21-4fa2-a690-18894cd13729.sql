CREATE TABLE public.law_daily_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lesson_date date not null,
  topic_key text not null,
  law_name text not null,
  section_ref text,
  category text,
  difficulty text,
  content jsonb not null default '{}'::jsonb,
  english_terms jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

CREATE UNIQUE INDEX law_daily_lessons_user_topic_uidx ON public.law_daily_lessons (user_id, topic_key);
CREATE INDEX law_daily_lessons_user_date_idx ON public.law_daily_lessons (user_id, lesson_date DESC);

GRANT SELECT ON public.law_daily_lessons TO authenticated;
GRANT ALL ON public.law_daily_lessons TO service_role;
ALTER TABLE public.law_daily_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own law lessons" ON public.law_daily_lessons FOR SELECT TO authenticated USING (auth.uid() = user_id);