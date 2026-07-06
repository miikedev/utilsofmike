-- ============================================================
-- Migration: server-side busy check for challenges
-- Backs the new "In a match" status shown in place of the Challenge
-- button. Presence (used for that label) is eventually consistent, so
-- this re-checks authoritatively against the matches table instead of
-- trusting the client's view of who's free. Safe to run standalone.
-- ============================================================

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
