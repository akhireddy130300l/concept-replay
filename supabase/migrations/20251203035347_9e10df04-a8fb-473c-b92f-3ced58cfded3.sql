-- Add is_daily column to learned_topics for daily email content
ALTER TABLE public.learned_topics 
ADD COLUMN is_daily boolean DEFAULT false;

-- Update the English topic to be daily
UPDATE public.learned_topics 
SET is_daily = true 
WHERE title LIKE '%English%' OR title LIKE '%english%';