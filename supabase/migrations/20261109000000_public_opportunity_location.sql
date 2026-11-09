-- Preserve the public view's columns and RLS while exposing an address-only venue.
create or replace view public.public_opportunity_listings
with (security_invoker = on) as
select
  o.id,
  o.title,
  o.description,
  coalesce(
    case when btrim(o.location_name) !~* '^(tbd|to be determined|to be announced|n/?a|unknown|location tbd)$'
      then nullif(btrim(o.location_name), '') end,
    nullif(btrim(o.address_line1), '')
  ) as location_name,
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
