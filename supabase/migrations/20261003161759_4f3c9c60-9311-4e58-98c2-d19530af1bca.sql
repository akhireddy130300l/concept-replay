CREATE TABLE public.shadow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  source_type text NOT NULL DEFAULT 'generated' CHECK (source_type IN ('generated','daily','uploaded')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating_text','generating_audio','assembling','verifying_duration','completed','partial_failure','failed')),
  progress_label text,
  transcript text,
  duration_seconds numeric,
  audio_path text,
  voice_provider text,
  voice_id text,
  text_model text,
  generation_version int NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  error_message text,
  step_count int NOT NULL DEFAULT 0,
  last_step_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX shadow_sessions_user_created_idx ON public.shadow_sessions (user_id, created_at DESC);
GRANT SELECT ON public.shadow_sessions TO authenticated;
GRANT ALL ON public.shadow_sessions TO service_role;
ALTER TABLE public.shadow_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view their shadow sessions" ON public.shadow_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.shadow_session_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.shadow_sessions(id) ON DELETE CASCADE,
  section_index int NOT NULL,
  text text,
  audio_path text,
  duration_seconds numeric,
  generation_status text NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending','text_done','audio_done','failed')),
  retry_count int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, section_index)
);
CREATE INDEX shadow_sections_session_idx ON public.shadow_session_sections (session_id, section_index);
GRANT SELECT ON public.shadow_session_sections TO authenticated;
GRANT ALL ON public.shadow_session_sections TO service_role;
ALTER TABLE public.shadow_session_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view their shadow sections" ON public.shadow_session_sections FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.shadow_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));