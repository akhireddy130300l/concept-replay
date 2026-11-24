CREATE TABLE public.automation_email_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('stock','english','recap')),
 delivery_key text NOT NULL UNIQUE, is_test boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
 subject text, content_html text, provider_id text, audio_available boolean,
 error_message text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
GRANT SELECT ON public.automation_email_deliveries TO authenticated;
GRANT ALL ON public.automation_email_deliveries TO service_role;
ALTER TABLE public.automation_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_delivery_read ON public.automation_email_deliveries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX automation_delivery_user_time ON public.automation_email_deliveries(user_id,kind,created_at DESC);
CREATE TABLE public.automation_test_cooldowns (
 user_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('stock','english')),
 request_id uuid NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,kind)
);
GRANT ALL ON public.automation_test_cooldowns TO service_role;
ALTER TABLE public.automation_test_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_automation_test(_user_id uuid, _kind text, _request_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed integer;
BEGIN
 IF _kind NOT IN ('stock','english') THEN RAISE EXCEPTION 'Invalid test kind'; END IF;
 INSERT INTO public.automation_test_cooldowns(user_id,kind,request_id) VALUES(_user_id,_kind,_request_id)
 ON CONFLICT(user_id,kind) DO UPDATE SET requested_at=now(),request_id=EXCLUDED.request_id
 WHERE automation_test_cooldowns.requested_at <= now()-interval '5 minutes';
 GET DIAGNOSTICS claimed=ROW_COUNT;
 RETURN claimed=1;
END; $$;
REVOKE ALL ON FUNCTION public.claim_automation_test(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_test(uuid,text,uuid) TO service_role;