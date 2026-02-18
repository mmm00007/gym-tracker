-- ============================================================
-- ⚠️  DESTRUCTIVE RESET SCHEMA (DEV/BOOTSTRAP ONLY)
-- This script drops and recreates core objects.
-- Do NOT rerun in production/editor environments with live user data.
-- Use incremental files in supabase/migrations/ for updates.
-- ============================================================

create extension if not exists "uuid-ossp";

create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;

create or replace function public.muscle_groups_array_to_profile(groups text[])
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'group', trim(group_name),
          'role', 'primary',
          'percent', 100
        )
      )
      from unnest(coalesce(groups, '{}'::text[])) as group_name
      where length(trim(group_name)) > 0
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.is_valid_muscle_profile(profile jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  with entries as (
    select
      elem,
      elem ->> 'group' as group_name,
      elem ->> 'role' as role,
      (elem ->> 'percent')::int as percent
    from jsonb_array_elements(coalesce(profile, '[]'::jsonb)) elem
  )
  select
    jsonb_typeof(coalesce(profile, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(profile, '[]'::jsonb)) > 0
    and not exists (
      select 1
      from entries
      where jsonb_typeof(elem) <> 'object'
        or group_name is null
        or length(trim(group_name)) = 0
        or role not in ('primary', 'secondary')
        or percent is null
    )
    and exists (
      select 1
      from entries
      where role = 'primary'
    )
    and not exists (
      select 1
      from entries
      where role = 'primary' and percent <> 100
    )
    and not exists (
      select 1
      from entries
      where role = 'secondary' and (percent < 1 or percent > 99)
    );
$$;

create or replace function public.sync_machine_muscle_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_profile_entries boolean;
  has_group_entries boolean;
  profile_changed boolean;
  groups_changed boolean;
begin
  has_profile_entries := (
    case
      when jsonb_typeof(new.muscle_profile) = 'array' then jsonb_array_length(new.muscle_profile)
      else 0
    end
  ) > 0;
  has_group_entries := coalesce(array_length(new.muscle_groups, 1), 0) > 0;

  if tg_op = 'UPDATE' then
    profile_changed := new.muscle_profile is distinct from old.muscle_profile;
    groups_changed := new.muscle_groups is distinct from old.muscle_groups;

    if groups_changed and not profile_changed then
      new.muscle_profile := public.muscle_groups_array_to_profile(new.muscle_groups);
    elsif profile_changed then
      new.muscle_groups := array(
        select distinct trim(entry ->> 'group')
        from jsonb_array_elements(new.muscle_profile) entry
        where length(trim(entry ->> 'group')) > 0
      );
    end if;
  elsif not has_profile_entries and has_group_entries then
    new.muscle_profile := public.muscle_groups_array_to_profile(new.muscle_groups);
  elsif has_profile_entries then
    new.muscle_groups := array(
      select distinct trim(entry ->> 'group')
      from jsonb_array_elements(new.muscle_profile) entry
      where length(trim(entry ->> 'group')) > 0
    );
  end if;

  return new;
end;
$$;

-- Drop in dependency order for clean re-apply during development.
drop view if exists public.session_summaries;
drop view if exists public.equipment_set_counts;
drop table if exists public.analysis_reports cascade;
drop table if exists public.recommendation_scopes cascade;
drop table if exists public.soreness_reports cascade;
drop table if exists public.sets cascade;
drop table if exists public.sessions cascade;
drop table if exists public.plan_items cascade;
drop table if exists public.plan_days cascade;
drop table if exists public.plans cascade;
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
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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
  rating smallint check (rating between 1 and 5),
  is_favorite boolean not null default false,
  muscle_groups text[] not null default '{}',
  muscle_profile jsonb not null default '[]'::jsonb,
  movement_pattern text not null default 'other' check (
    movement_pattern in (
      'squat',
      'hip_hinge',
      'lunge',
      'horizontal_push',
      'vertical_push',
      'horizontal_pull',
      'vertical_pull',
      'carry',
      'rotation',
      'isolation',
      'other'
    )
  ),
  movement_variation text[] not null default '{}',
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
  check (public.is_valid_muscle_profile(muscle_profile)),
  check (coalesce(array_length(thumbnails, 1), 0) <= 4)
);

create trigger trg_sync_machine_muscle_fields
  before insert or update on public.machines
  for each row
  execute procedure public.sync_machine_muscle_fields();

alter table public.machines enable row level security;
create policy "Users manage own machines" on public.machines
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index idx_machines_user on public.machines(user_id);
create index idx_machines_equipment_type on public.machines(user_id, equipment_type);
create index idx_machines_user_is_favorite on public.machines(user_id, is_favorite);
create index idx_machines_user_rating_desc on public.machines(user_id, rating desc);
create index idx_machines_muscle_profile_gin on public.machines using gin (muscle_profile jsonb_path_ops);
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

  update public.machines
  set
    name = 'Bodyweight Squat',
    equipment_type = 'bodyweight',
    muscle_groups = array['Quadriceps','Glutes','Core']::text[],
    movement = 'Squat',
    exercise_type = 'Legs',
    default_weight = 0,
    default_reps = 15,
    notes = 'Sit between hips and keep heels planted',
    thumbnails = array['https://static.strengthlevel.com/images/exercises/bodyweight-squat/bodyweight-squat-800.avif']::text[],
    instruction_image = null,
    source = null
  where user_id = v_user_id
    and lower(name) = 'leg press machine';

  update public.machines
  set
    name = 'Cable Lat Pulldown',
    equipment_type = 'cable',
    movement = 'Vertical Pull',
    muscle_groups = array['Back','Biceps']::text[],
    exercise_type = 'Pull',
    default_weight = 35,
    default_reps = 10,
    notes = 'Pull bar to upper chest with stable torso',
    thumbnails = array['https://static.strengthlevel.com/images/exercises/lat-pulldown/lat-pulldown-800.avif']::text[],
    instruction_image = null,
    source = null
  where user_id = v_user_id
    and lower(name) = 'lat pulldown machine';

  update public.machines
  set
    thumbnails = array[instruction_image],
    instruction_image = null
  where user_id = v_user_id
    and coalesce(array_length(thumbnails, 1), 0) = 0
    and instruction_image ilike 'https://%.avif';

  insert into public.machines (
    user_id, name, movement, equipment_type, muscle_groups, exercise_type,
    default_weight, default_reps, notes, thumbnails, instruction_image, source
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
    array[seed.thumbnail_image],
    null,
    case
      when seed.equipment_type = 'machine' then 'default_catalog'
      else null
    end
  from (
    values
      ('Barbell Back Squat', 'Squat', 'freeweight', array['Quadriceps','Glutes','Core']::text[], 'Legs', 60::real, 5, 'Brace and keep bar path over mid-foot', 'https://static.strengthlevel.com/images/exercises/bodyweight-squat/bodyweight-squat-800.avif'),
      ('Romanian Deadlift', 'Hip Hinge', 'freeweight', array['Hamstrings','Glutes','Back']::text[], 'Pull', 50::real, 8, 'Push hips back and maintain neutral spine', 'https://static.strengthlevel.com/images/exercises/romanian-deadlift/romanian-deadlift-800.avif'),
      ('Barbell Bench Press', 'Horizontal Press', 'freeweight', array['Chest','Shoulders','Triceps']::text[], 'Push', 40::real, 6, 'Control descent and drive evenly', 'https://static.strengthlevel.com/images/exercises/smith-machine-bench-press/smith-machine-bench-press-800.avif'),
      ('Pull-Up', 'Vertical Pull', 'bodyweight', array['Back','Biceps']::text[], 'Pull', 0::real, 6, 'Full hang to chest-up as able', 'https://static.strengthlevel.com/images/exercises/pull-ups/pull-ups-800.avif'),
      ('Push-Up', 'Horizontal Press', 'bodyweight', array['Chest','Shoulders','Triceps','Core']::text[], 'Push', 0::real, 12, 'Maintain rigid plank line', 'https://static.strengthlevel.com/images/exercises/push-ups/push-ups-800.avif'),
      ('Walking Lunge', 'Lunge', 'bodyweight', array['Quadriceps','Glutes','Hamstrings']::text[], 'Legs', 0::real, 10, 'Step long and control knee path', 'https://static.strengthlevel.com/images/exercises/bodyweight-squat/bodyweight-squat-800.avif'),
      ('Cable Row', 'Horizontal Pull', 'cable', array['Back','Biceps']::text[], 'Pull', 30::real, 10, 'Lead with elbows and avoid shrugging', 'https://static.strengthlevel.com/images/exercises/seated-cable-row/seated-cable-row-800.avif'),
      ('Cable Lat Pulldown', 'Vertical Pull', 'cable', array['Back','Biceps']::text[], 'Pull', 35::real, 10, 'Pull bar to upper chest with stable torso', 'https://static.strengthlevel.com/images/exercises/lat-pulldown/lat-pulldown-800.avif'),
      ('Bodyweight Squat', 'Squat', 'bodyweight', array['Quadriceps','Glutes','Core']::text[], 'Legs', 0::real, 15, 'Sit between hips and keep heels planted', 'https://static.strengthlevel.com/images/exercises/bodyweight-squat/bodyweight-squat-800.avif'),
      ('Cable Lateral Raise', 'Lateral Raise', 'cable', array['Shoulders']::text[], 'Push', 8::real, 12, 'Slight forward lean and controlled tempo', 'https://static.strengthlevel.com/images/exercises/dumbbell-lateral-raise/dumbbell-lateral-raise-800.avif'),
      ('Dumbbell Shoulder Press', 'Vertical Press', 'freeweight', array['Shoulders','Triceps','Upper Chest']::text[], 'Push', 16::real, 10, 'Press overhead without arching the lower back', 'https://static.strengthlevel.com/images/exercises/dumbbell-front-raise/dumbbell-front-raise-800.avif'),
      ('Dumbbell Incline Press', 'Incline Press', 'freeweight', array['Chest','Shoulders','Triceps']::text[], 'Push', 18::real, 10, 'Keep shoulder blades retracted and wrists stacked', 'https://static.strengthlevel.com/images/exercises/smith-machine-bench-press/smith-machine-bench-press-800.avif'),
      ('Dumbbell Bent-Over Row', 'Horizontal Pull', 'freeweight', array['Back','Lats','Biceps']::text[], 'Pull', 22::real, 10, 'Hinge at hips and pull elbow toward hip', 'https://static.strengthlevel.com/images/exercises/dumbbell-row/dumbbell-row-800.avif'),
      ('Dumbbell Biceps Curl', 'Elbow Flexion', 'freeweight', array['Biceps','Forearms']::text[], 'Pull', 10::real, 12, 'Control the eccentric and avoid torso sway', 'https://static.strengthlevel.com/images/exercises/dumbbell-concentration-curl/dumbbell-concentration-curl-800.avif'),
      ('Dumbbell Bulgarian Split Squat', 'Single-Leg Squat', 'freeweight', array['Quadriceps','Glutes','Hamstrings']::text[], 'Legs', 14::real, 10, 'Stay upright and drive through full front foot', 'https://static.strengthlevel.com/images/exercises/bodyweight-squat/bodyweight-squat-800.avif'),
      ('Dumbbell Romanian Deadlift', 'Hip Hinge', 'freeweight', array['Hamstrings','Glutes','Back']::text[], 'Pull', 20::real, 10, 'Keep dumbbells close and hinge without rounding', 'https://static.strengthlevel.com/images/exercises/dumbbell-romanian-deadlift/dumbbell-romanian-deadlift-800.avif')
  ) as seed(name, movement, equipment_type, muscle_groups, exercise_type, default_weight, default_reps, notes, thumbnail_image)
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

-- ─── SESSIONS (legacy-compatible historical records only) ───────
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
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index idx_sessions_user on public.sessions(user_id, started_at desc);
create unique index uq_sessions_id_user on public.sessions(id, user_id);

-- ─── PLANS (normalized workout planning model) ─────────────
create table public.plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  goal text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_days (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  label text,
  created_at timestamptz not null default now(),
  unique (plan_id, weekday)
);

create table public.plan_items (
  id uuid primary key default uuid_generate_v4(),
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  machine_id uuid references public.machines(id) on delete set null,
  target_set_type text not null default 'working' check (
    target_set_type in ('warmup', 'working', 'top', 'drop', 'backoff', 'failure')
  ),
  target_sets int check (target_sets is null or target_sets > 0),
  target_rep_range int4range,
  target_weight_range numrange,
  notes text,
  order_index int not null check (order_index >= 0),
  unique (plan_day_id, order_index)
);

alter table public.plans enable row level security;
create policy "Users manage own plans" on public.plans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.plan_days enable row level security;
create policy "Users manage own plan days" on public.plan_days
  for all
  using (
    exists (
      select 1
      from public.plans p
      where p.id = plan_days.plan_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.plans p
      where p.id = plan_days.plan_id
        and p.user_id = (select auth.uid())
    )
  );

alter table public.plan_items enable row level security;
create policy "Users manage own plan items" on public.plan_items
  for all
  using (
    exists (
      select 1
      from public.plan_days pd
      join public.plans p on p.id = pd.plan_id
      where pd.id = plan_items.plan_day_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.plan_days pd
      join public.plans p on p.id = pd.plan_id
      where pd.id = plan_items.plan_day_id
        and p.user_id = (select auth.uid())
    )
  );

create index idx_plans_user_active_updated on public.plans(user_id, is_active, updated_at desc);
create index idx_plan_days_plan_weekday on public.plan_days(plan_id, weekday);
create index idx_plan_items_day_order on public.plan_items(plan_day_id, order_index);

-- ─── SETS (set-centric ownership + grouping keys) ──────────
create table public.sets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Optional legacy linkage only (Phase 1 set-centric cutover keeps this nullable for historical compatibility).
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

create or replace function public.recompute_workout_clusters(
  p_user_id uuid,
  p_training_date date,
  p_gap_threshold_minutes int default 90
)
returns void
language plpgsql
set search_path = public, extensions
as $$
begin
  if p_user_id is null or p_training_date is null then
    return;
  end if;

  -- Serialize recomputation per user + training_date so concurrent trigger
  -- executions cannot overwrite cluster assignments using stale snapshots.
  perform pg_advisory_xact_lock(
    hashtextextended(
      format('workout-cluster-recompute:%s:%s', p_user_id::text, p_training_date::text),
      0
    )
  );

  with ordered_sets as (
    select
      st.id,
      st.logged_at,
      lag(st.logged_at) over (order by st.logged_at, st.id) as prev_logged_at
    from public.sets st
    where st.user_id = p_user_id
      and st.training_date = p_training_date
  ),
  clustered_sets as (
    select
      os.id,
      sum(
        case
          when os.prev_logged_at is null
            or os.logged_at - os.prev_logged_at > make_interval(mins => p_gap_threshold_minutes)
            then 1
          else 0
        end
      ) over (order by os.logged_at, os.id rows unbounded preceding) as cluster_seq
    from ordered_sets os
  ),
  desired_clusters as (
    select
      cs.id,
      uuid_generate_v5(
        uuid_ns_url(),
        format('workout-cluster:%s:%s:%s', p_user_id::text, p_training_date::text, cs.cluster_seq)
      ) as cluster_id
    from clustered_sets cs
  )
  update public.sets st
  set workout_cluster_id = dc.cluster_id
  from desired_clusters dc
  where st.id = dc.id
    and st.workout_cluster_id is distinct from dc.cluster_id;
end;
$$;

create or replace function public.compute_set_grouping_fields()
returns trigger
language plpgsql
set search_path = public
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
set search_path = public
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

create or replace function public.refresh_workout_cluster_assignments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_workout_clusters(old.user_id, old.training_date);
    return null;
  end if;

  perform public.recompute_workout_clusters(new.user_id, new.training_date);

  if tg_op = 'UPDATE'
    and (old.user_id is distinct from new.user_id or old.training_date is distinct from new.training_date) then
    perform public.recompute_workout_clusters(old.user_id, old.training_date);
  end if;

  return null;
end;
$$;

create trigger trg_sets_refresh_workout_clusters
after insert or update of user_id, logged_at, training_date or delete
on public.sets
for each row
execute function public.refresh_workout_cluster_assignments();

alter table public.sets enable row level security;
create policy "Users manage own sets" on public.sets
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index idx_sets_user_logged on public.sets(user_id, logged_at desc);
create index idx_sets_bucket on public.sets(user_id, training_bucket_id, logged_at desc);
create index idx_sets_cluster on public.sets(user_id, training_date, workout_cluster_id, logged_at desc);
-- Canonical favorites lookup index (user + machine + recency).
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
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
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
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index idx_recommendation_scopes_user on public.recommendation_scopes(user_id, created_at desc);

-- ─── ANALYSIS REPORTS (persisted recommendation + trend outputs) ─
create table public.analysis_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_scope_id uuid references public.recommendation_scopes(id) on delete set null,
  report_type text not null default 'recommendation' check (report_type in ('recommendation', 'weekly_trend')),
  status text not null default 'ready' check (status in ('ready', 'failed')),
  title text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analysis_reports enable row level security;
create policy "Users manage own analysis reports" on public.analysis_reports
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index idx_analysis_reports_user_created on public.analysis_reports(user_id, created_at desc);
create index idx_analysis_reports_user_type_created on public.analysis_reports(user_id, report_type, created_at desc);

-- ─── HELPER VIEW (training-day summaries) ───────────────────
create or replace view public.session_summaries
with (security_invoker = true) as
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

-- Canonical equipment volume signal for favorites/recommendations.
-- Edge cases:
--   * No data: users without any matching sets simply produce no rows.
--   * Null machine_id: excluded because favorites must map to concrete equipment.
--   * Ties: rank columns remain deterministic by applying machine_id as a secondary sort key.
create or replace view public.equipment_set_counts
with (security_invoker = true) as
with machine_set_counts as (
  select
    st.user_id,
    st.machine_id,
    count(*) filter (where st.logged_at >= now() - interval '30 days')::bigint as sets_30d,
    count(*) filter (where st.logged_at >= now() - interval '90 days')::bigint as sets_90d,
    count(*)::bigint as sets_all
  from public.sets st
  where st.machine_id is not null
  group by st.user_id, st.machine_id
)
select
  msc.user_id,
  msc.machine_id,
  msc.sets_30d,
  msc.sets_90d,
  msc.sets_all,
  rank() over (partition by msc.user_id order by msc.sets_30d desc, msc.machine_id) as rank_30d,
  rank() over (partition by msc.user_id order by msc.sets_90d desc, msc.machine_id) as rank_90d,
  rank() over (partition by msc.user_id order by msc.sets_all desc, msc.machine_id) as rank_all
from machine_set_counts msc;
