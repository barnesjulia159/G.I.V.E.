begin;

-- Definer helpers avoid policy recursion and derive authority from database state,
-- never from user-editable JWT metadata or a caller-supplied tenant ID.
create or replace function public.user_owns_opportunity(opportunity_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $function$
  select public.is_nonprofit() and exists (
    select 1
    from public.opportunities o
    join public.organizations org on org.id = o.organization_id
    where o.id = opportunity_uuid and org.user_id = auth.uid()
  );
$function$;

create or replace function public.can_view_opportunity(opportunity_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.opportunities o
    where o.id = opportunity_uuid and (
      (o.status = 'published' and not o.is_deleted)
      or public.is_admin()
      or public.user_owns_opportunity(o.id)
      or (public.is_volunteer() and exists (
        select 1 from public.bookings b
        where b.opportunity_id = o.id and b.volunteer_id = auth.uid()
      ))
    )
  );
$function$;

revoke all on function public.user_owns_opportunity(uuid) from public;
revoke all on function public.can_view_opportunity(uuid) from public;
grant execute on function public.user_owns_opportunity(uuid) to anon, authenticated;
grant execute on function public.can_view_opportunity(uuid) to anon, authenticated;

create or replace function public.protect_authorization_fields()
returns trigger
language plpgsql security definer
set search_path = public
as $function$
begin
  -- Trusted backend connections have no end-user subject; their application
  -- entry points must independently authenticate and scope every operation.
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Object identity cannot be changed.' using errcode = '42501';
  end if;

  if tg_table_name = 'profiles' then
    if not public.is_admin() and (
      new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.approval_status is distinct from old.approval_status
    ) then
      raise exception 'Only administrators can change account authorization.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'organizations' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Organization ownership cannot be changed.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'opportunities' then
    if new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Opportunity tenant and creator cannot be changed.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create trigger protect_profile_authorization
  before update on public.profiles
  for each row execute function public.protect_authorization_fields();
create trigger protect_organization_ownership
  before update on public.organizations
  for each row execute function public.protect_authorization_fields();
create trigger protect_opportunity_tenant
  before update on public.opportunities
  for each row execute function public.protect_authorization_fields();

create or replace function public.protect_booking_fields()
returns trigger
language plpgsql security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.opportunity_id is distinct from old.opportunity_id
      or new.volunteer_id is distinct from old.volunteer_id
    then
      raise exception 'Reservation identity, tenant and volunteer cannot be changed.' using errcode = '42501';
    end if;
    if public.is_admin() then
      return new;
    end if;
    if not public.is_volunteer() or old.volunteer_id <> auth.uid()
      or old.status not in ('booked', 'waitlisted') or new.status <> 'cancelled'
      or new.cancelled_at is null
      or (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
        is distinct from (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at'])
    then
      raise exception 'Volunteers may only cancel their own active reservations.' using errcode = '42501';
    end if;
  else
    if not public.is_volunteer() or new.volunteer_id <> auth.uid()
      or new.status not in ('booked', 'waitlisted')
      or new.hours_override is not null or new.hours_override_notes is not null
      or new.hours_override_by is not null or new.hours_override_at is not null
      or new.cancelled_at is not null
      or not exists (
        select 1 from public.opportunities o
        where o.id = new.opportunity_id and o.status = 'published' and not o.is_deleted
      )
    then
      raise exception 'Invalid volunteer reservation fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create trigger protect_booking_authorization
  before insert or update on public.bookings
  for each row execute function public.protect_booking_fields();

revoke all on function public.protect_authorization_fields() from public;
revoke all on function public.protect_booking_fields() from public;

-- Permissive policies are OR-ed. Replace the whole relevant policy set so old
-- creator-only or column-unrestricted policies cannot defeat the new boundary.
do $block$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('opportunities', 'bookings', 'opportunity_skills', 'opportunity_causes')
  loop
    execute format('drop policy %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end;
$block$;

alter table public.opportunities enable row level security;
alter table public.bookings enable row level security;
alter table public.opportunity_skills enable row level security;
alter table public.opportunity_causes enable row level security;

create policy opportunity_read on public.opportunities
  for select to anon, authenticated
  using (
    (status = 'published' and not is_deleted) or public.is_admin()
    or (public.is_nonprofit() and exists (
      select 1 from public.organizations org
      where org.id = organization_id and org.user_id = auth.uid()
    ))
    or (public.is_volunteer() and exists (
      select 1 from public.bookings b
      where b.opportunity_id = opportunities.id and b.volunteer_id = auth.uid()
    ))
  );
create policy opportunity_create on public.opportunities
  for insert to authenticated
  with check (
    public.is_nonprofit() and created_by = auth.uid()
    and exists (
      select 1 from public.organizations org
      where org.id = organization_id and org.user_id = auth.uid()
    )
  );
create policy opportunity_update on public.opportunities
  for update to authenticated
  using (public.is_admin() or public.user_owns_opportunity(id))
  with check (public.is_admin() or public.user_owns_opportunity(id));
create policy opportunity_delete on public.opportunities
  for delete to authenticated using (public.is_admin());

create policy booking_read on public.bookings
  for select to authenticated
  using (
    public.is_admin() or public.user_owns_opportunity(opportunity_id)
    or (public.is_volunteer() and volunteer_id = auth.uid())
  );
create policy booking_create on public.bookings
  for insert to authenticated
  with check (
    public.is_volunteer() and volunteer_id = auth.uid()
    and status in ('booked', 'waitlisted')
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.status = 'published' and not o.is_deleted
    )
  );
create policy booking_cancel on public.bookings
  for update to authenticated
  using (
    public.is_volunteer() and volunteer_id = auth.uid()
    and status in ('booked', 'waitlisted')
  )
  with check (public.is_volunteer() and volunteer_id = auth.uid() and status = 'cancelled');
create policy booking_admin_update on public.bookings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy opportunity_skills_read on public.opportunity_skills
  for select to anon, authenticated using (public.can_view_opportunity(opportunity_id));
create policy opportunity_skills_create on public.opportunity_skills
  for insert to authenticated
  with check (public.is_admin() or public.user_owns_opportunity(opportunity_id));
create policy opportunity_skills_delete on public.opportunity_skills
  for delete to authenticated
  using (public.is_admin() or public.user_owns_opportunity(opportunity_id));
create policy opportunity_causes_read on public.opportunity_causes
  for select to anon, authenticated using (public.can_view_opportunity(opportunity_id));
create policy opportunity_causes_create on public.opportunity_causes
  for insert to authenticated
  with check (public.is_admin() or public.user_owns_opportunity(opportunity_id));
create policy opportunity_causes_delete on public.opportunity_causes
  for delete to authenticated
  using (public.is_admin() or public.user_owns_opportunity(opportunity_id));

-- Owning an organization alone is not sufficient after an account is disabled
-- or changes role; this restrictive policy also constrains pre-existing policies.
create policy organization_active_owner_update on public.organizations
  as restrictive for update to authenticated
  using (public.is_admin() or (public.is_nonprofit() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_nonprofit() and user_id = auth.uid()));

commit;
