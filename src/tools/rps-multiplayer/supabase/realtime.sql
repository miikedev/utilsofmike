-- ============================================================
-- RPS Multiplayer — Realtime Broadcast
-- Idempotent — safe to re-run.
--
-- Three topic families, all PRIVATE channels:
--   'lobby'              -> presence / online list
--   'user:<profile_id>'  -> incoming challenges + profile updates
--   'match:<match_id>'   -> accept/decline/move sync
-- ============================================================

alter table realtime.messages enable row level security;

-- ---------- Realtime RLS policies ----------

drop policy if exists "any authenticated user can listen to lobby" on realtime.messages;
create policy "any authenticated user can listen to lobby"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'lobby'
);

drop policy if exists "any authenticated user can join lobby" on realtime.messages;
create policy "any authenticated user can join lobby"
on realtime.messages
for insert
to authenticated
with check (realtime.topic() = 'lobby');

drop policy if exists "listen to own user channel" on realtime.messages;
create policy "listen to own user channel"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'user:' || auth.uid()::text
);

drop policy if exists "listen to own match channel" on realtime.messages;
create policy "listen to own match channel"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'match:%'
  and exists (
    select 1 from public.matches m
    where m.id = split_part(realtime.topic(), ':', 2)::uuid
      and (m.player1 = auth.uid() or m.player2 = auth.uid())
  )
);

-- ---------- broadcast a new challenge to the invited player ----------

create or replace function public.broadcast_new_challenge()
returns trigger
security definer
language plpgsql
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || NEW.player2::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    NEW, OLD
  );
  return NEW;
end;
$$;

drop trigger if exists on_match_created on public.matches;
create trigger on_match_created
after insert on public.matches
for each row execute function public.broadcast_new_challenge();

-- ---------- broadcast match updates (accept/decline/move/result) ----------
-- CRITICAL: Sanitized payload — never leaks opponent's move mid-round.
-- Before status = 'completed', moves are replaced with boolean
-- move1_submitted / move2_submitted flags.

create or replace function public.broadcast_match_update()
returns trigger
security definer
language plpgsql
set search_path = public
as $$
declare
  safe_payload jsonb;
begin
  safe_payload := to_jsonb(NEW) - 'move1' - 'move2';

  if NEW.status = 'completed' then
    safe_payload := safe_payload
      || jsonb_build_object('move1', NEW.move1, 'move2', NEW.move2);
  else
    safe_payload := safe_payload
      || jsonb_build_object(
           'move1_submitted', NEW.move1 is not null,
           'move2_submitted', NEW.move2 is not null
         );
  end if;

  perform realtime.send(
    safe_payload,
    TG_OP,
    'match:' || NEW.id::text,
    true
  );
  return NEW;
end;
$$;

drop trigger if exists on_match_updated on public.matches;
create trigger on_match_updated
after update on public.matches
for each row execute function public.broadcast_match_update();

-- ---------- broadcast profile updates (live win/loss/draw counts) ----------

create or replace function public.broadcast_profile_update()
returns trigger
security definer
language plpgsql
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || NEW.id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    NEW, OLD
  );
  return NEW;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
after update on public.profiles
for each row execute function public.broadcast_profile_update();
