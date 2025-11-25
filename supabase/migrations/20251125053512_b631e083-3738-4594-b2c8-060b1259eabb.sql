-- Add revision_count column to track spaced repetition stage
ALTER TABLE public.learned_topics 
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;