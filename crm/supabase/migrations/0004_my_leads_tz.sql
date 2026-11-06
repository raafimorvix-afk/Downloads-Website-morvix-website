-- agents see the appointment in the client's local time, so return the time zone too
drop function public.my_leads();
create function public.my_leads()
returns table (code text, submitted_at timestamptz, company text, city text, state text,
               appt_at timestamptz, appt_timezone text, status text, client_feedback text)
language sql stable security definer set search_path = public as $$
  select code, submitted_at, company, city, state, appt_at, appt_timezone,
         case when status in ('Pass','Decline','QA Rejected') then status
              when status = 'Rebook – Needs New Date' then 'Rebooking'
              else 'In progress' end,
         case when status in ('Decline','QA Rejected') then client_feedback end
  from leads where agent_id = auth.uid() order by submitted_at desc
$$;
revoke execute on function public.my_leads() from public, anon;
grant execute on function public.my_leads() to authenticated;
