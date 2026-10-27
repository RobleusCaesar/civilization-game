-- 0009 — FEEDBACK: the players' reports, kept beside the email
--
-- WHY. The settings page (js/settings.js) has a Feedback & Support form: a bug,
-- an idea, a crash report or anything else, with the player's email so the
-- developer can reply. The report is EMAILED to the developer through
-- FormSubmit (js/feedback.js) — and a copy lands here, so nothing depends on
-- one mail relay, and the reports can be searched later.
--
-- WHAT.
--   1. public.feedback — one row per report, sealed (RLS on, no policy, every
--      privilege revoked from anon and authenticated)
--   2. public.submit_feedback(p_kind, p_email, p_message, p_details) — the
--      ONE door, SECURITY DEFINER, granted to authenticated alone
--
-- THE SHAPE OF AN ANSWER (the 0008 rule). jsonb { ok:true } (with
-- already:true for a duplicate) or { ok:false, reason:'…' }. Never an 'error'
-- key: Backend's transport reads a top-level 'error' as a network failure and
-- would retry a refusal. js/feedback.js keeps a report in its outbox only for
-- 'not_authenticated' and 'slow_down'; any other refusal is final.
--
-- NEVER TWICE. The game's outbox retries a report until it is answered, and
-- an answer can be lost on the way back. Every report carries its own client
-- reference (p_details->>'ref', minted once on the device), and a second
-- delivery of the same reference by the same player answers ok + already.
--
-- CAPS. kind is one of bug / idea / crash / other; the email is at most 254
-- characters and must look like one; the message is 1..4000 characters; the
-- details are at most 20000 characters of JSON (the browser, the screen, the
-- run in progress and the last twenty script errors — js/feedback.js caps
-- them well under this). THE RATE: ten reports an hour and thirty a day per
-- player; past that the answer is 'slow_down' and the outbox waits.
--
-- SEALED BY DEFAULT. The table has RLS on, NO policy, and every direct
-- privilege revoked from anon and authenticated (Supabase grants new objects
-- to both by name, which `revoke … from public` never touches). The only way
-- in is submit_feedback, which reads auth.uid() itself. Nothing reads the
-- table back to the client: the developer reads it in the dashboard.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0008. It is ONE idempotent block: the table and its indexes IF NOT EXISTS,
-- the function CREATE OR REPLACE with the one signature this file defines,
-- every grant re-stated. Running it twice changes nothing the second time.
--
-- WITHOUT THIS MIGRATION the form still works: the email goes out, and the
-- copy's call is a 404, which js/feedback.js reads as "nowhere to keep it".

-- ===========================================================================
-- 1. THE TABLE
-- ===========================================================================
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('bug', 'idea', 'crash', 'other')),
  email       text not null check (char_length(email) between 6 and 254),
  message     text not null check (char_length(message) between 1 and 4000),
  details     jsonb not null default '{}'::jsonb,
  ref         text check (ref is null or char_length(ref) between 1 and 64),
  handled     boolean not null default false
);
create index if not exists feedback_user_time on public.feedback (user_id, created_at desc);
create index if not exists feedback_time on public.feedback (created_at desc);
create unique index if not exists feedback_user_ref on public.feedback (user_id, ref) where ref is not null;

alter table public.feedback enable row level security;
revoke all on table public.feedback from public;
revoke all on table public.feedback from anon, authenticated;

-- ===========================================================================
-- 2. THE DOOR
-- ===========================================================================
create or replace function public.submit_feedback(p_kind text, p_email text, p_message text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_ref   text;
  v_email text := btrim(coalesce(p_email, ''));
  v_msg   text := btrim(coalesce(p_message, ''));
  v_det   jsonb := coalesce(p_details, '{}'::jsonb);
  v_hour  integer;
  v_day   integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_kind is null or p_kind not in ('bug', 'idea', 'crash', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if char_length(v_email) not between 6 and 254
     or v_email !~ '^[^[:space:]@<>(),;:"]+@[^[:space:]@<>(),;:"]+\.[A-Za-z]{2,}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if char_length(v_msg) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_message');
  end if;
  if jsonb_typeof(v_det) <> 'object' or char_length(v_det::text) > 20000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_details');
  end if;
  v_ref := nullif(left(coalesce(v_det ->> 'ref', ''), 64), '');

  perform pg_advisory_xact_lock(hashtext('clanfire-feedback:' || v_uid::text));

  -- NEVER TWICE: the outbox's retry of a report whose answer was lost
  if v_ref is not null and exists (
       select 1 from public.feedback f where f.user_id = v_uid and f.ref = v_ref) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- THE RATE: ten an hour, thirty a day
  select count(*) filter (where f.created_at > now() - interval '1 hour'),
         count(*)
    into v_hour, v_day
    from public.feedback f
   where f.user_id = v_uid and f.created_at > now() - interval '1 day';
  if v_hour >= 10 or v_day >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'slow_down');
  end if;

  insert into public.feedback (user_id, kind, email, message, details, ref)
  values (v_uid, p_kind, v_email, v_msg, v_det, v_ref);
  return jsonb_build_object('ok', true);
end
$$;
revoke all on function public.submit_feedback(text, text, text, jsonb) from public;
revoke all on function public.submit_feedback(text, text, text, jsonb) from anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, jsonb) to authenticated;
