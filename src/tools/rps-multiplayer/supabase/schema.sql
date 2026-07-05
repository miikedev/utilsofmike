-- ============================================================
-- Rock Paper Scissors — Realtime Multiplayer Schema
-- Run this in the Supabase SQL editor.
-- Requires: Authentication > Providers > Anonymous sign-ins ENABLED
--
-- Uses Supabase Realtime BROADCAST (not Postgres Changes) for
-- challenge/move sync — no publication/replication setup needed,
-- it's all triggers + private, authorized channels below.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ----------------------------------------
-- Tables & Constraints
-- ----------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by any authenticated user" on public.profiles;
create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

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
  constraint valid_status check (status in ('pending','active','completed','declined')),
  constraint players_differ check (player1 <> player2)
);

alter table public.matches enable row level security;

drop policy if exists "players can read their own matches" on public.matches;
create policy "players can read their own matches"
  on public.matches for select
  to authenticated
  using (auth.uid() = player1 or auth.uid() = player2);

-- ----------------------------------------
-- Security-Definer Functions
-- ----------------------------------------

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

  insert into public.matches (player1, player2, status)
  values (auth.uid(), opponent_id, 'pending')
  returning id into new_match_id;

  return new_match_id;
end;
$$;

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
      raise exception 'Move already submitted';
    end if;
    update public.matches set move1 = my_move where id = match_id;
    m.move1 = my_move;
  elsif auth.uid() = m.player2 then
    if m.move2 is not null then
      raise exception 'Move already submitted';
    end if;
    update public.matches set move2 = my_move where id = match_id;
    m.move2 = my_move;
  else
    raise exception 'You are not a player in this match';
  end if;

  if m.move1 is not null and m.move2 is not null then
    if m.move1 = m.move2 then
      result_winner := null;
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

-- ----------------------------------------
-- Realtime Broadcast
-- ----------------------------------------

alter table realtime.messages enable row level security;

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
