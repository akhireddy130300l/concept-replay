ALTER TABLE public.opportunity_ideas
  ADD COLUMN IF NOT EXISTS is_breakthrough_update BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_idea_id UUID;