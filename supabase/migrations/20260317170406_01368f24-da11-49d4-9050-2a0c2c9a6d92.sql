
ALTER TABLE public.user_rewards 
  ADD COLUMN IF NOT EXISTS topic_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_topic_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_topic_date date;
