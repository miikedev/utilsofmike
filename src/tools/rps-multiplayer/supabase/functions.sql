-- ============================================================
-- RPS Multiplayer — Security-Definer Functions
-- Idempotent — safe to re-run.
-- ============================================================

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
