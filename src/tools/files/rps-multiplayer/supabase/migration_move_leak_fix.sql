-- ============================================================
-- Migration: move-leak fix + reconnect resync RPCs
-- Safe to run on top of the original schema.sql — only touches
-- what changed (submit_move, the match broadcast trigger, and
-- two new RPCs). Nothing here drops data.
-- ============================================================

-- 1. submit_move: reject overwriting an already-submitted move
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

-- 2. broadcast_match_update: redact in-progress moves before broadcasting
-- (this is the fix for the opponent-move-peeking issue)
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
    'match:' || NEW.id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    broadcast_new, OLD
  );
  return NEW;
end;
$$;
-- create or replace function doesn't require re-creating the trigger itself
-- (the trigger just points at the function name), so no DROP/CREATE TRIGGER
-- needed here.

-- 3. New RPCs: caller-aware match reads for reconnect/resync
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
