-- 0015 — the analytics passphrase may also arrive as a request HEADER.
--
-- Why: so a Claude session can read the dashboard without ever holding the
-- passphrase. The operator saves it once as a network secret on the
-- session's environment (header `x-analytics-key`, host
-- draauhjtgifmelzwlojv.supabase.co); the session's proxy adds the header to
-- every request, and the session itself never sees the value.
--
-- What changes: analytics__ok, the one check every 0010+ door asks first,
-- now takes the passphrase from p_token as before OR, when p_token is empty,
-- from the `x-analytics-key` header PostgREST hands over in request.headers.
-- The SAME secret is checked against the SAME hash, so nothing is weaker:
-- without the passphrase every door still answers no. The page keeps
-- sending p_token exactly as before.
--
-- One idempotent paste, after 0010–0014.

create or replace function public.analytics__ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.analytics_config c
    where c.id = 1
      and c.token_hash = encode(extensions.digest(coalesce(
            nullif(p_token, ''),
            nullif(current_setting('request.headers', true), '')::json ->> 'x-analytics-key',
            ''), 'sha256'), 'hex'));
$$;
revoke all on function public.analytics__ok(text) from public;
revoke all on function public.analytics__ok(text) from anon, authenticated;
