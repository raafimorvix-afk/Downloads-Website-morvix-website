-- submit_lead now returns the new lead's id + code (the form needs the id to attach the recording),
-- and accepts the appointment as the client's local date/time + time zone.
drop function public.submit_lead(jsonb);
create function public.submit_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_code text;
  v_shift uuid := coalesce(my_shift(), case when is_owner() then nullif(p->>'shift_id','')::uuid end);
  v_tz text := nullif(p->>'appt_timezone','');
  v_appt timestamptz;
begin
  if my_role() is null then raise exception 'Not signed in'; end if;
  if v_shift is null then raise exception 'Choose a shift'; end if;
  if coalesce(trim(p->>'company'),'') = '' then raise exception 'Company name is required'; end if;
  if coalesce(trim(p->>'phone'),'') = '' then raise exception 'Phone number is required'; end if;
  if nullif(p->>'appt_local','') is not null then
    if v_tz is null then raise exception 'Choose the appointment time zone'; end if;
    v_appt := (p->>'appt_local')::timestamp at time zone v_tz;
  end if;
  insert into leads (shift_id, campaign_id, agent_id, company, contact_name, contact_designation, business_type,
                     phone, email, street, city, state, zip, country, appt_at, appt_timezone, frequency,
                     facility_size, current_type, preferences, current_provider, agent_notes, extra, source)
  values (v_shift,
          (select id from campaigns where id = nullif(p->>'campaign_id','')::uuid and shift_id = v_shift),
          auth.uid(), trim(p->>'company'), p->>'contact_name', p->>'contact_designation', p->>'business_type',
          trim(p->>'phone'), p->>'email', p->>'street', p->>'city', p->>'state', p->>'zip', p->>'country',
          v_appt, v_tz, p->>'frequency', p->>'facility_size', p->>'current_type', p->>'preferences',
          p->>'current_provider', p->>'agent_notes', coalesce(p->'extra','{}'::jsonb), 'CRM form')
  returning id, code into v_id, v_code;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;
revoke execute on function public.submit_lead(jsonb) from public, anon;
grant execute on function public.submit_lead(jsonb) to authenticated;
