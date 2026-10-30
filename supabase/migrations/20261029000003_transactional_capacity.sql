begin;

create or replace function public.validate_opportunity_capacity()
returns trigger
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  booked_count bigint;
begin
  if new.capacity is null or new.capacity <= 0 then
    raise exception 'Capacity must be a positive integer.';
  end if;

  if tg_op = 'UPDATE' then
    if new.capacity is not distinct from old.capacity then
      return new;
    end if;

    -- UPDATE already holds the opportunity row lock used by booking writes.
    -- A separate statement sees bookings committed while waiting for that lock.
    select count(*) into booked_count
    from public.bookings b
    where b.opportunity_id = new.id
      and b.status = 'booked'::public.booking_status;

    if new.capacity < booked_count then
      raise exception 'Capacity cannot be lower than the % confirmed bookings.', booked_count;
    end if;
  end if;

  return new;
end;
$function$;

create trigger validate_opportunity_capacity
  before insert or update of capacity on public.opportunities
  for each row execute function public.validate_opportunity_capacity();

commit;
