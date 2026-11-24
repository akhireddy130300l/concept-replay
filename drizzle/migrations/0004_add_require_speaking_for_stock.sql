ALTER TABLE public.speaking_user_state
ADD COLUMN IF NOT EXISTS require_speaking_for_stock BOOLEAN NOT NULL DEFAULT TRUE;