-- ============================================================
-- RPS Multiplayer — Tables & Constraints
-- Idempotent — safe to re-run.
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
  constraint valid_status check (status in ('pending','active','completed','declined')),
  constraint players_differ check (player1 <> player2)
);

alter table public.matches enable row level security;

drop policy if exists "players can read their own matches" on public.matches;
create policy "players can read their own matches"
  on public.matches for select
  to authenticated
  using (auth.uid() = player1 or auth.uid() = player2);

-- Inserts/updates are only ever done via the security-definer functions
-- below, so no direct insert/update policy is granted to clients.
