CREATE TABLE public.american_word_recaps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sent_for date NOT NULL UNIQUE, story text, sent_ok boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.american_word_recaps TO service_role;
ALTER TABLE public.american_word_recaps ENABLE ROW LEVEL SECURITY;