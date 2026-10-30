begin;

-- Keep cancelled history while allowing at most one active registration per pair.
-- Do not discard existing duplicates: index creation must fail if they need repair.
drop index if exists public.idx_bookings_unique_active;
create unique index idx_bookings_unique_active
  on public.bookings (opportunity_id, volunteer_id)
  where status in ('booked'::public.booking_status, 'waitlisted'::public.booking_status);

create or replace function public.validate_booking_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  opportunity_record record;
  active_count bigint;
begin
  if tg_op = 'UPDATE' then
    -- Cancellation and attendance updates do not consume additional capacity.
    if new.opportunity_id = old.opportunity_id
      and (new.status <> 'booked'::public.booking_status or old.status = 'booked'::public.booking_status)
    then
      return new;
    end if;
  end if;

  select o.id, o.capacity, o.status, o.is_deleted, o.start_at
  into opportunity_record
  from public.opportunities o
  where o.id = new.opportunity_id
  for update;

  if opportunity_record.id is null then
    raise exception 'Opportunity does not exist.';
  end if;

  if opportunity_record.status <> 'published' then
    raise exception 'Only published opportunities can be booked.';
  end if;

  if opportunity_record.is_deleted then
    raise exception 'This opportunity is no longer available.';
  end if;

  if opportunity_record.start_at <= now() then
    raise exception 'This opportunity has already started.';
  end if;

  -- This separate statement gets a fresh READ COMMITTED snapshot after waiting
  -- for the opportunity lock. Exclude the current row on status transitions.
  select count(*) into active_count
  from public.bookings b
  where b.opportunity_id = new.opportunity_id
    and b.status = 'booked'::public.booking_status
    and b.id is distinct from new.id;

  if active_count >= opportunity_record.capacity then
    raise exception 'This opportunity is full.';
  end if;

  return new;
end;
$function$;

-- Replace any existing insert-only registration of this validation function.
do $block$
declare
  existing_trigger record;
begin
  for existing_trigger in
    select tgname from pg_trigger
    where tgrelid = 'public.bookings'::regclass
      and tgfoid = 'public.validate_booking_insert()'::regprocedure
      and not tgisinternal
  loop
    execute format('drop trigger %I on public.bookings', existing_trigger.tgname);
  end loop;
end;
$block$;

create trigger validate_booking_write
  before insert or update of opportunity_id, status on public.bookings
  for each row execute function public.validate_booking_insert();

commit;
