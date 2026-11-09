alter table public.attendance_logs
  add column verified_at timestamptz,
  add column verified_by uuid,
  add constraint attendance_confirmation_requires_complete_present_session check (
    (verified_at is null and verified_by is null) or
    (verified_at is not null and verified_by is not null and status = 'present'
      and check_in_at is not null and check_out_at is not null and check_out_at > check_in_at)
  );

-- Confirmation is only written by authenticated, tenant-authorized server handlers.
revoke insert, update, delete on public.attendance_logs from anon, authenticated;
