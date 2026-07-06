-- ============================================================
-- Rock Paper Scissors — Realtime Multiplayer Schema
-- Run this in the Supabase SQL editor.
-- Requires: Authentication > Providers > Anonymous sign-ins ENABLED
--
-- Uses Supabase Realtime BROADCAST (not Postgres Changes) for
-- challenge/move sync — no publication/replication setup needed,
-- it's all triggers + private, authorized channels below.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------- matches ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  player1 uuid not null references public.profiles (id) on delete cascade,
  player2 uuid not null references public.profiles (id) on delete cascade,
  move1 text,
  move2 text,
  winner uuid references public.profiles (id),
  status text not null default 'pending', -- pending | active | completed | declined
  created_at timestamptz not null default now(),
  constraint valid_move check (move1 in ('rock','paper','scissors') or move1 is null),
  constraint valid_move2 check (move2 in ('rock','paper','scissors') or move2 is null),
  constraint valid_status check (status in ('pending','active','completed','declined'))
);

alter table public.matches enable row level security;

create policy "players can read their own matches"
  on public.matches for select
  to authenticated
  using (auth.uid() = player1 or auth.uid() = player2);

-- Inserts/updates are only ever done via the security-definer functions
-- below, so no direct insert/update policy is granted to clients.

-- ---------- create a challenge ----------
create or replace function public.create_challenge(opponent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_match_id uuid;
begin
  if opponent_id = auth.uid() then
    raise exception 'Cannot challenge yourself';
  end if;

  -- Presence (used for the "in a match" label in the UI) is eventually
  -- consistent, so re-check authoritatively here rather than trusting the
  -- client's view of who's free.
  if exists (
    select 1 from public.matches
    where status in ('pending', 'active')
      and (player1 = opponent_id or player2 = opponent_id)
  ) then
    raise exception 'That player is already in a match';
  end if;

  if exists (
    select 1 from public.matches
    where status in ('pending', 'active')
      and (player1 = auth.uid() or player2 = auth.uid())
  ) then
    raise exception 'You are already in a match';
  end if;

  insert into public.matches (player1, player2, status)
  values (auth.uid(), opponent_id, 'pending')
  returning id into new_match_id;

  return new_match_id;
end;
$$;

-- ---------- respond to a challenge ----------
create or replace function public.respond_challenge(match_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches
  set status = case when accept then 'active' else 'declined' end
  where id = match_id
    and player2 = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Challenge not found or already answered';
  end if;
end;
$$;

-- ---------- submit a move & resolve the round ----------
create or replace function public.submit_move(match_id uuid, my_move text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  result_winner uuid;
begin
  if my_move not in ('rock','paper','scissors') then
    raise exception 'Invalid move';
  end if;

  select * into m from public.matches where id = match_id for update;

  if m.id is null then
    raise exception 'Match not found';
  end if;
  if m.status != 'active' then
    raise exception 'Match is not active';
  end if;

  if auth.uid() = m.player1 then
    if m.move1 is not null then
      raise exception 'You already submitted a move for this match';
    end if;
    update public.matches set move1 = my_move where id = match_id;
    m.move1 = my_move;
  elsif auth.uid() = m.player2 then
    if m.move2 is not null then
      raise exception 'You already submitted a move for this match';
    end if;
    update public.matches set move2 = my_move where id = match_id;
    m.move2 = my_move;
  else
    raise exception 'You are not a player in this match';
  end if;

  -- Only resolve once both moves are in
  if m.move1 is not null and m.move2 is not null then
    if m.move1 = m.move2 then
      result_winner := null; -- draw
    elsif (m.move1 = 'rock' and m.move2 = 'scissors')
       or (m.move1 = 'scissors' and m.move2 = 'paper')
       or (m.move1 = 'paper' and m.move2 = 'rock') then
      result_winner := m.player1;
    else
      result_winner := m.player2;
    end if;

    update public.matches
    set status = 'completed', winner = result_winner
    where id = match_id;

    if result_winner is null then
      update public.profiles set draws = draws + 1 where id in (m.player1, m.player2);
    else
      update public.profiles set wins = wins + 1 where id = result_winner;
      update public.profiles set losses = losses + 1
        where id = case when result_winner = m.player1 then m.player2 else m.player1 end;
    end if;
  end if;
end;
$$;

grant execute on function public.create_challenge(uuid) to authenticated;
grant execute on function public.respond_challenge(uuid, boolean) to authenticated;
grant execute on function public.submit_move(uuid, text) to authenticated;

-- ============================================================
-- REALTIME — Broadcast
-- Two topic families:
--   'user:<profile_id>'  -> incoming challenges + your own profile updates
--   'match:<match_id>'   -> accept/decline/move sync for one match
-- Both are PRIVATE channels, so Realtime Authorization (RLS on
-- realtime.messages) controls exactly who can subscribe to what.
-- ============================================================

alter table realtime.messages enable row level security;

-- Only the invited/owning user can listen on their own "user:<id>" topic.
create policy "listen to own user channel"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'user:' || auth.uid()::text
);

-- Only the two players in a match can listen on its "match:<id>" topic.
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
    'user:' || NEW.player2::text,  -- topic: the invited player's channel
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    NEW, OLD
  );
  return NEW;
end;
$$;

create trigger on_match_created
after insert on public.matches
for each row execute function public.broadcast_new_challenge();

-- ---------- broadcast match updates (accept/decline/move/result) ----------
-- SECURITY: this topic is shared by both players, so the payload can't be
-- customized per-subscriber. Until the match is 'completed' we redact any
-- submitted move down to the sentinel 'submitted' (non-null, but not a
-- real move) so neither player can read the other's choice off the wire
-- before both have moved. Clients track their own in-flight pick locally
-- and only trust the real move1/move2 values once status = 'completed'.
create or replace function public.broadcast_match_update()
returns trigger
security definer
language plpgsql
set search_path = public
as $$
declare
  broadcast_new public.matches;
begin
  broadcast_new := NEW;
  if broadcast_new.status <> 'completed' then
    if broadcast_new.move1 is not null then broadcast_new.move1 := 'submitted'; end if;
    if broadcast_new.move2 is not null then broadcast_new.move2 := 'submitted'; end if;
  end if;

  perform realtime.broadcast_changes(
    'match:' || NEW.id::text,      -- topic: this specific match
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    broadcast_new, OLD
  );
  return NEW;
end;
$$;

create trigger on_match_updated
after update on public.matches
for each row execute function public.broadcast_match_update();

-- ---------- caller-aware match reads (used to resync after reconnect) ----------
-- Unlike the broadcast above, an RPC response is per-caller, so it's safe to
-- reveal the caller's OWN move while still redacting the opponent's until
-- the match is completed. This lets a client that reloads mid-match restore
-- "you already moved, waiting on opponent" instead of re-showing the move
-- buttons, without ever exposing the opponent's pick early.
create or replace function public.get_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
begin
  select * into m
  from public.matches
  where id = p_match_id
    and (player1 = auth.uid() or player2 = auth.uid());

  if m.id is null then
    raise exception 'Match not found';
  end if;

  if m.status <> 'completed' then
    if auth.uid() = m.player1 and m.move2 is not null then
      m.move2 := 'submitted';
    elsif auth.uid() = m.player2 and m.move1 is not null then
      m.move1 := 'submitted';
    end if;
  end if;

  return m;
end;
$$;

-- Finds the caller's most recent pending/active match, if any, for resync
-- on connect (page load, reconnect after a dropped socket, etc.) — Broadcast
-- has no replay, so anything missed while disconnected must be re-fetched.
create or replace function public.get_ongoing_match()
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
begin
  select id into mid
  from public.matches
  where (player1 = auth.uid() or player2 = auth.uid())
    and status in ('pending', 'active')
  order by created_at desc
  limit 1;

  if mid is null then
    return null;
  end if;

  return public.get_match(mid);
end;
$$;

grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.get_ongoing_match() to authenticated;

-- ---------- broadcast profile updates (live win/loss/draw counts) ----------
create or replace function public.broadcast_profile_update()
returns trigger
security definer
language plpgsql
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || NEW.id::text,       -- topic: that user's own channel
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    NEW, OLD
  );
  return NEW;
end;
$$;

create trigger on_profile_updated
after update on public.profiles
for each row execute function public.broadcast_profile_update();

