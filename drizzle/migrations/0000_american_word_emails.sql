CREATE TABLE public.american_word_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL,
  word_key text GENERATED ALWAYS AS (lower(trim(word))) STORED,
  pronunciation text NOT NULL,
  meaning text,
  sentence text NOT NULL,
  sentence_key text GENERATED ALWAYS AS (lower(regexp_replace(sentence, '[^a-zA-Z ]', '', 'g'))) STORED,
  sent_for date NOT NULL,
  et_hour int NOT NULL,
  sent_ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (word_key),
  UNIQUE (sentence_key),
  UNIQUE (sent_for, et_hour)
);
GRANT ALL ON public.american_word_emails TO service_role;
ALTER TABLE public.american_word_emails ENABLE ROW LEVEL SECURITY;