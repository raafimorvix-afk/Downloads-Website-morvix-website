-- managers record the emails they send (for their own shift only)
create policy email_log_insert on public.email_log for insert to authenticated
  with check (can_manage(shift_id) and sent_by = auth.uid());
