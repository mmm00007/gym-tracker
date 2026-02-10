-- ============================================================
-- GYM TRACKER - Supabase Schema (Phase 1 cutover)
-- DB-first, no legacy migration path.
-- ============================================================

create extension if not exists "uuid-ossp";

create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;

-- Drop in dependency order for clean re-apply during development.
drop view if exists public.session_summaries;
drop table if exists public.recommendation_scopes cascade;
drop table if exists public.soreness_reports cascade;
drop table if exists public.sets cascade;
drop table if exists public.sessions cascade;
drop table if exists public.machines cascade;
drop table if exists public.user_preferences cascade;

-- ─── USER PREFERENCES ───────────────────────────────────────
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day_start_hour int not null default 4 check (day_start_hour between 0 and 23),
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  sleep_window_start time,
  sleep_window_end time,
  workout_window_start time,
  workout_window_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
create policy "Users manage own preferences" on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── MACHINES (canonical equipment model) ───────────────────
create table public.machines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  exercise_type text,
  movement text not null check (length(trim(movement)) > 0),
  equipment_type text not null default 'machine' check (
    equipment_type in ('machine', 'freeweight', 'bodyweight', 'cable', 'band', 'other')
  ),
  muscle_groups text[] not null default '{}',
  variations text[] not null default '{}',
  thumbnails text[] not null default '{}',
  instruction_image text,
  source text,
  default_weight real default 20,
  default_reps int default 10,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(array_length(muscle_groups, 1), 0) > 0),
  check (
    equipment_type = 'machine'
    or (
      coalesce(array_length(thumbnails, 1), 0) = 0
      and instruction_image is null
      and source is null
    )
  )
);

alter table public.machines enable row level security;
create policy "Users manage own machines" on public.machines
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index idx_machines_user on public.machines(user_id);
create index idx_machines_equipment_type on public.machines(user_id, equipment_type);
create unique index uq_machines_id_user on public.machines(id, user_id);


create or replace function public.seed_default_equipment_catalog()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  inserted_count int;
begin
  if v_user_id is null then
    raise exception 'Authentication required for seed_default_equipment_catalog';
  end if;

  insert into public.machines (
    user_id, name, movement, equipment_type, muscle_groups, exercise_type,
    default_weight, default_reps, notes, source
  )
  select
    v_user_id,
    seed.name,
    seed.movement,
    seed.equipment_type,
    seed.muscle_groups,
    seed.exercise_type,
    seed.default_weight,
    seed.default_reps,
    seed.notes,
    case
      when seed.equipment_type = 'machine' then 'default_catalog'
      else null
    end
  from (
    values
      ('Barbell Back Squat', 'Squat', 'freeweight', array['Quadriceps','Glutes','Core']::text[], 'Legs', 60::real, 5, 'Brace and keep bar path over mid-foot'),
      ('Romanian Deadlift', 'Hip Hinge', 'freeweight', array['Hamstrings','Glutes','Back']::text[], 'Pull', 50::real, 8, 'Push hips back and maintain neutral spine'),
      ('Barbell Bench Press', 'Horizontal Press', 'freeweight', array['Chest','Shoulders','Triceps']::text[], 'Push', 40::real, 6, 'Control descent and drive evenly'),
      ('Pull-Up', 'Vertical Pull', 'bodyweight', array['Back','Biceps']::text[], 'Pull', 0::real, 6, 'Full hang to chest-up as able'),
      ('Push-Up', 'Horizontal Press', 'bodyweight', array['Chest','Shoulders','Triceps','Core']::text[], 'Push', 0::real, 12, 'Maintain rigid plank line'),
      ('Walking Lunge', 'Lunge', 'bodyweight', array['Quadriceps','Glutes','Hamstrings']::text[], 'Legs', 0::real, 10, 'Step long and control knee path'),
      ('Cable Row', 'Horizontal Pull', 'cable', array['Back','Biceps']::text[], 'Pull', 30::real, 10, 'Lead with elbows and avoid shrugging'),
      ('Lat Pulldown Machine', 'Vertical Pull', 'machine', array['Back','Biceps']::text[], 'Pull', 40::real, 10, 'Pull to upper chest with stable torso'),
      ('Leg Press Machine', 'Squat', 'machine', array['Quadriceps','Glutes']::text[], 'Legs', 80::real, 10, 'Control depth and avoid locking knees'),
      ('Cable Lateral Raise', 'Lateral Raise', 'cable', array['Shoulders']::text[], 'Push', 8::real, 12, 'Slight forward lean and controlled tempo')
  ) as seed(name, movement, equipment_type, muscle_groups, exercise_type, default_weight, default_reps, notes)
  where not exists (
    select 1
    from public.machines m
    where m.user_id = v_user_id
      and lower(m.name) = lower(seed.name)
      and m.equipment_type = seed.equipment_type
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.seed_default_machine_catalog()
returns int
language sql
security definer
set search_path = public
as $$
  select public.seed_default_equipment_catalog();
$$;

-- ─── SESSIONS (legacy-compatible, non-authoritative) ───────
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  recommendations jsonb,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
create policy "Users manage own sessions" on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index idx_sessions_user on public.sessions(user_id, started_at desc);
create unique index uq_sessions_id_user on public.sessions(id, user_id);

-- ─── SETS (set-centric ownership + grouping keys) ──────────
create table public.sets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  reps int not null check (reps > 0),
  weight real not null check (weight >= 0),
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'top', 'drop', 'backoff', 'failure')),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  logged_at timestamptz not null default now(),
  training_date date not null,
  training_bucket_id text not null,
  workout_cluster_id uuid,
  created_at timestamptz not null default now(),
  check (training_bucket_id <> '')
);

create or replace function public.compute_set_grouping_fields()
returns trigger
language plpgsql
as $$
declare
  pref_day_start int := 4;
  pref_timezone text := 'UTC';
  shifted_local_time timestamp;
begin
  if new.logged_at is null then
    new.logged_at := now();
  end if;

  if new.user_id is null then
    raise exception 'sets.user_id is required';
  end if;

  select up.day_start_hour, up.timezone
  into pref_day_start, pref_timezone
  from public.user_preferences up
  where up.user_id = new.user_id;

  pref_day_start := coalesce(pref_day_start, 4);
  pref_timezone := coalesce(pref_timezone, 'UTC');

  shifted_local_time := (new.logged_at at time zone pref_timezone) - make_interval(hours => pref_day_start);

  new.training_date := shifted_local_time::date;
  new.training_bucket_id := 'training_day:' || new.training_date::text;

  return new;
end;
$$;

create trigger trg_sets_compute_grouping_fields
before insert or update of user_id, logged_at
on public.sets
for each row
execute function public.compute_set_grouping_fields();

create or replace function public.validate_set_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.session_id is not null then
    if not exists (
      select 1 from public.sessions s
      where s.id = new.session_id and s.user_id = new.user_id
    ) then
      raise exception 'session_id does not belong to sets.user_id';
    end if;
  end if;

  if new.machine_id is not null then
    if not exists (
      select 1 from public.machines m
      where m.id = new.machine_id and m.user_id = new.user_id
    ) then
      raise exception 'machine_id does not belong to sets.user_id';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_sets_validate_ownership
before insert or update of user_id, session_id, machine_id
on public.sets
for each row
execute function public.validate_set_ownership();

alter table public.sets enable row level security;
create policy "Users manage own sets" on public.sets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index idx_sets_user_logged on public.sets(user_id, logged_at desc);
create index idx_sets_bucket on public.sets(user_id, training_bucket_id, logged_at desc);
create index idx_sets_machine on public.sets(user_id, machine_id, logged_at desc);

-- ─── SORENESS REPORTS (bucket linked, no session dependency) ─
create table public.soreness_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_bucket_id text not null,
  muscle_group text not null,
  level int not null check (level between 0 and 4),
  reported_at timestamptz not null default now(),
  unique (user_id, training_bucket_id, muscle_group)
);

alter table public.soreness_reports enable row level security;
create policy "Users manage own soreness" on public.soreness_reports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index idx_soreness_user_bucket on public.soreness_reports(user_id, training_bucket_id);
create index idx_soreness_user_reported on public.soreness_reports(user_id, reported_at desc);

-- ─── RECOMMENDATION SCOPES (explicit reproducibility record) ─
create table public.recommendation_scopes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grouping text not null check (grouping in ('training_day', 'cluster')),
  date_start date,
  date_end date,
  included_set_types text[] not null default '{working}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (date_end is null or date_start is null or date_start <= date_end)
);

alter table public.recommendation_scopes enable row level security;
create policy "Users manage own recommendation scopes" on public.recommendation_scopes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index idx_recommendation_scopes_user on public.recommendation_scopes(user_id, created_at desc);

-- ─── HELPER VIEW (training-day summaries) ───────────────────
create or replace view public.session_summaries as
select
  st.user_id,
  st.training_date,
  st.training_bucket_id,
  min(st.logged_at) as started_at,
  max(st.logged_at) as ended_at,
  count(st.id) as set_count,
  array_agg(distinct m.movement) filter (where m.movement is not null) as exercises,
  array_agg(distinct mg) filter (where mg is not null) as muscle_groups_trained
from public.sets st
left join public.machines m on m.id = st.machine_id
left join lateral unnest(m.muscle_groups) as mg on true
group by st.user_id, st.training_date, st.training_bucket_id;
