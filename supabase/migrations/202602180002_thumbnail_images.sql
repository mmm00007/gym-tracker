-- Move seeded .avif catalog media into thumbnails for all equipment types.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'machines_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      drop constraint machines_check;
  end if;
end;
$$;

alter table public.machines
  add constraint machines_check
  check (coalesce(array_length(thumbnails, 1), 0) <= 4) not valid;

update public.machines
set
  thumbnails = array[instruction_image],
  instruction_image = null
where coalesce(array_length(thumbnails, 1), 0) = 0
  and instruction_image ilike 'https://%.avif';

alter table public.machines validate constraint machines_check;

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
    and source = 'default_catalog'
    and equipment_type = 'machine'
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
    and source = 'default_catalog'
    and equipment_type = 'machine'
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
