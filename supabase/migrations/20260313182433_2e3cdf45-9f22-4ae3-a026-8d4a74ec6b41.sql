
-- Quiz responses table to track email quiz answers
CREATE TABLE public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  topic_id UUID REFERENCES public.learned_topics(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  selected_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quiz responses"
ON public.quiz_responses FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow insert via service role or anon for email links"
ON public.quiz_responses FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- User rewards table for PUBG-style medals
CREATE TABLE public.user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  total_points INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers INTEGER NOT NULL DEFAULT 0,
  total_quizzes INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'Bronze',
  last_quiz_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rewards"
ON public.user_rewards FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own rewards"
ON public.user_rewards FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow insert for rewards"
ON public.user_rewards FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX idx_quiz_responses_user_id ON public.quiz_responses(user_id);
CREATE INDEX idx_quiz_responses_topic_id ON public.quiz_responses(topic_id);
CREATE INDEX idx_user_rewards_user_id ON public.user_rewards(user_id);
