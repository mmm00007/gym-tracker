-- ============================================================
-- GYM TRACKER - Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── MACHINES ──────────────────────────────────────────────
create table public.machines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  exercise_type text, -- Push, Pull, Legs, Core
  movement text not null,
  muscle_groups text[] default '{}',
  variations text[] default '{}',
  default_weight real default 20,
  default_reps int default 10,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.machines enable row level security;
create policy "Users manage own machines" on public.machines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_machines_user on public.machines(user_id);

-- ─── SESSIONS ──────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  recommendations jsonb,
  created_at timestamptz default now()
);

alter table public.sessions enable row level security;
create policy "Users manage own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_sessions_user on public.sessions(user_id, started_at desc);

-- ─── SETS ──────────────────────────────────────────────────
create table public.sets (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade not null,
  machine_id uuid references public.machines(id) on delete set null,
  reps int not null,
  weight real not null,
  duration_seconds int, -- optional: timed set duration
  rest_seconds int,     -- auto-tracked rest since previous set
  logged_at timestamptz default now()
);

alter table public.sets enable row level security;
create policy "Users manage own sets" on public.sets
  for all using (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
  );
create index idx_sets_session on public.sets(session_id, logged_at);

-- ─── SORENESS REPORTS ──────────────────────────────────────
create table public.soreness_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  session_id uuid references public.sessions(id) on delete cascade not null,
  muscle_group text not null,
  level int not null check (level between 0 and 4),
  -- 0=none, 1=mild, 2=moderate, 3=very sore, 4=extreme
  reported_at timestamptz default now()
);

alter table public.soreness_reports enable row level security;
create policy "Users manage own soreness" on public.soreness_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_soreness_user on public.soreness_reports(user_id, reported_at desc);

-- ─── HELPER VIEW: sessions with set counts ─────────────────
create or replace view public.session_summaries as
select
  s.id,
  s.user_id,
  s.started_at,
  s.ended_at,
  s.recommendations,
  count(st.id) as set_count,
  array_agg(distinct m.movement) filter (where m.movement is not null) as exercises,
  array_agg(distinct unnest_mg) filter (where unnest_mg is not null) as muscle_groups_trained
from public.sessions s
left join public.sets st on st.session_id = s.id
left join public.machines m on m.id = st.machine_id
left join lateral unnest(m.muscle_groups) as unnest_mg on true
group by s.id;
