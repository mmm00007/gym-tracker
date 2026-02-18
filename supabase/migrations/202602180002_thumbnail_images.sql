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
