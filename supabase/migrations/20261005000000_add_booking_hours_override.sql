alter table public.bookings
  add column hours_override double precision,
  add column hours_override_notes text,
  add column hours_override_by uuid,
  add column hours_override_at timestamptz(6),
  add constraint bookings_hours_override_range
    check (hours_override is null or (hours_override >= 0 and hours_override <= 24)),
  add constraint bookings_hours_override_by_fkey
    foreign key (hours_override_by) references public.profiles(id) on delete set null;