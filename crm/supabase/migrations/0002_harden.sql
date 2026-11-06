-- Security hardening from the Supabase advisor
alter function public.lead_next_action(public.leads) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.lead_rebook() set search_path = public;

-- helpers are only needed by signed-in users (inside the security rules)
revoke execute on function public.my_role(), public.my_shift(), public.is_owner(),
  public.can_manage(uuid), public.can_attach(uuid) from public, anon;
grant execute on function public.my_role(), public.my_shift(), public.is_owner(),
  public.can_manage(uuid), public.can_attach(uuid) to authenticated;

-- trigger function: nobody calls it directly
revoke execute on function public.lead_status_history() from public, anon, authenticated;
