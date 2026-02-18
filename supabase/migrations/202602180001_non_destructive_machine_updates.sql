-- Non-destructive incremental migration.
-- Safe for production/editor environments: no table drops.

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

create table if not exists public.user_preferences (
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

create table if not exists public.machines (
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
  is_unilateral boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(array_length(muscle_groups, 1), 0) > 0),
  check (public.is_valid_muscle_profile(muscle_profile))
);

alter table public.user_preferences enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferences'
      and policyname = 'Users manage own preferences'
  ) then
    create policy "Users manage own preferences" on public.user_preferences
      for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

alter table public.machines enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'machines'
      and policyname = 'Users manage own machines'
  ) then
    create policy "Users manage own machines" on public.machines
      for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

alter table public.machines
  add column if not exists muscle_groups text[] not null default '{}',
  add column if not exists muscle_profile jsonb not null default '[]'::jsonb,
  add column if not exists movement_pattern text not null default 'other',
  add column if not exists is_unilateral boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.machines
  alter column muscle_profile set default '[]'::jsonb,
  alter column muscle_groups set default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_equipment_type_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_equipment_type_check
      check (equipment_type in ('machine', 'freeweight', 'bodyweight', 'cable', 'band', 'other')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_rating_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_rating_check
      check (rating between 1 and 5) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_movement_pattern_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_movement_pattern_check
      check (
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
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_muscle_groups_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_muscle_groups_check
      check (coalesce(array_length(muscle_groups, 1), 0) > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_muscle_profile_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_muscle_profile_check
      check (public.is_valid_muscle_profile(muscle_profile)) not valid;
  end if;
end;
$$;

update public.machines
set muscle_profile = public.muscle_groups_array_to_profile(muscle_groups)
where coalesce(jsonb_array_length(muscle_profile), 0) = 0
  and coalesce(array_length(muscle_groups, 1), 0) > 0;

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

drop trigger if exists trg_sync_machine_muscle_fields on public.machines;
create trigger trg_sync_machine_muscle_fields
before insert or update on public.machines
for each row execute function public.sync_machine_muscle_fields();

create index if not exists idx_machines_user on public.machines(user_id);
create index if not exists idx_machines_equipment_type on public.machines(user_id, equipment_type);
create index if not exists idx_machines_user_is_favorite on public.machines(user_id, is_favorite);
create index if not exists idx_machines_user_rating_desc on public.machines(user_id, rating desc);
create index if not exists idx_machines_muscle_profile_gin on public.machines using gin (muscle_profile jsonb_path_ops);
create unique index if not exists uq_machines_id_user on public.machines(id, user_id);
