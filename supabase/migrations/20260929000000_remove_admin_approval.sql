-- Remove admin approval requirements: everything is approved by default and no longer gated on approval.

begin;

-- Approve existing records and make new ones approved by default.
update public.organizations set is_approved = true where is_approved = false;
update public.profiles set approval_status = 'approved' where approval_status <> 'approved';
alter table public.organizations alter column is_approved set default true;

-- New nonprofit sign-ups are no longer created as pending.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requested_role public.user_role;
begin
  requested_role :=
    case
      when new.raw_user_meta_data ->> 'role' in ('volunteer', 'nonprofit')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'volunteer'::public.user_role
    end;

  insert into public.profiles (
    id,
    role,
    first_name,
    last_name,
    display_name,
    approval_status
  )
  values (
    new.id,
    requested_role,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      new.email
    ),
    'approved'::public.profile_approval_status
  );

  return new;
end;
$function$;

-- Booking validation no longer checks organization approval.
create or replace function public.validate_booking_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  opportunity_record record;
  active_count integer;
begin
  select
    o.id,
    o.capacity,
    o.status,
    o.is_deleted,
    o.start_at
  into opportunity_record
  from public.opportunities o
  where o.id = new.opportunity_id;

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

  select public.opportunity_active_booking_count(new.opportunity_id)
  into active_count;

  if active_count >= opportunity_record.capacity then
    raise exception 'This opportunity is full.';
  end if;

  return new;
end;
$function$;

-- Public listings include every published opportunity.
create or replace view public.public_opportunity_listings
with (security_invoker = on) as
select
  o.id,
  o.title,
  o.description,
  o.location_name,
  o.city,
  o.state,
  o.start_at,
  o.end_at,
  o.capacity,
  o.minimum_age,
  o.accessibility_notes,
  o.requirements,
  o.is_virtual,
  org.name as organization_name,
  org.id as organization_id,
  (select count(*) from public.bookings b
    where b.opportunity_id = o.id and b.status = 'booked'::public.booking_status) as booked_count,
  (o.capacity - (select count(*) from public.bookings b
    where b.opportunity_id = o.id and b.status = 'booked'::public.booking_status)) as spots_remaining
from public.opportunities o
join public.organizations org on org.id = o.organization_id
where o.status = 'published'::public.opportunity_status
  and o.is_deleted = false;

-- RLS policies without approval checks.
drop policy if exists "Approved organizations are public" on public.organizations;
create policy "Organizations are public"
  on public.organizations
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Approved nonprofits can create opportunities" on public.opportunities;
create policy "Nonprofits can create opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_nonprofit()
    and exists (
      select 1 from public.organizations org
      where org.id = opportunities.organization_id
        and org.user_id = auth.uid()
    )
  );

drop policy if exists "Volunteers can create their own bookings" on public.bookings;
create policy "Volunteers can create their own bookings"
  on public.bookings
  for insert
  to authenticated
  with check (
    volunteer_id = auth.uid()
    and public.is_volunteer()
    and exists (
      select 1 from public.opportunities o
      where o.id = bookings.opportunity_id
        and o.status = 'published'::public.opportunity_status
        and o.is_deleted = false
        and public.opportunity_active_booking_count(o.id) < o.capacity
    )
  );

commit;
