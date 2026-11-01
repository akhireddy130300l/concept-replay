CREATE TABLE public.cron_run_locks (
  name text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cron_run_locks TO service_role;
ALTER TABLE public.cron_run_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_run_lock(_name text, _seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE got int;
BEGIN
  INSERT INTO public.cron_run_locks(name, locked_until) VALUES (_name, now() + make_interval(secs => _seconds))
  ON CONFLICT (name) DO UPDATE SET locked_until = EXCLUDED.locked_until, updated_at = now()
    WHERE public.cron_run_locks.locked_until < now();
  GET DIAGNOSTICS got = ROW_COUNT;
  RETURN got > 0;
END $$;

CREATE OR REPLACE FUNCTION public.release_run_lock(_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.cron_run_locks SET locked_until = now(), updated_at = now() WHERE name = _name;
$$;
REVOKE ALL ON FUNCTION public.try_acquire_run_lock(text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_run_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_run_lock(text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_run_lock(text) TO service_role;