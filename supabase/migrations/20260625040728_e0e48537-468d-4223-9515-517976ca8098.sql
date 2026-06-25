CREATE TABLE public.portfolio_feature_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  report_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_feature_access TO authenticated;
GRANT ALL ON public.portfolio_feature_access TO service_role;

ALTER TABLE public.portfolio_feature_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own access row"
ON public.portfolio_feature_access
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_pfa_updated_at
BEFORE UPDATE ON public.portfolio_feature_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.portfolio_feature_access (user_id, enabled, report_email)
VALUES ('5f617679-5201-4f98-8a7c-a4747cadea3a', true, 'no-reply-reminder1@outlook.com')
ON CONFLICT (user_id) DO UPDATE
  SET enabled = EXCLUDED.enabled, report_email = EXCLUDED.report_email, updated_at = now();
