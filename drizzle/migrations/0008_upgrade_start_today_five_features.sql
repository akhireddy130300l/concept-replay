ALTER TABLE public.opportunity_ideas
  ADD COLUMN IF NOT EXISTS opportunity_stage TEXT NOT NULL DEFAULT 'early_wave';

ALTER TABLE public.opportunity_actions
  ADD COLUMN IF NOT EXISTS is_weekly_focus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_steps JSONB NOT NULL DEFAULT '[]'::jsonb;