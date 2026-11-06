-- Morvix CRM: initial schema
-- Roles: owner (everything), manager (own shift only), agent (submit leads + see own results only).
-- Shift separation is enforced by Row Level Security, so a night-shift login cannot read
-- day-shift data even through the API, not just hidden in the screens.


-- ---------------------------------------------------------------- shifts / people
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                  -- 'US Night Shift', 'Australia Shift'
  timezone text not null default 'Asia/Dhaka',
  digest_hour smallint not null default 9 check (digest_hour between 0 and 23),
  from_email text,                            -- mailbox this shift sends from (sales@ / info@)
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('owner','manager','agent')),
  shift_id uuid references public.shifts(id),
  active boolean not null default true,
  aliases text[] not null default '{}',       -- old form names that map to this agent ("Luis" -> Luis Torres)
  created_at timestamptz not null default now(),
  constraint shift_required check (role = 'owner' or shift_id is not null)
);

-- Helpers used by every policy. SECURITY DEFINER so they can read profiles without recursion.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function public.my_shift() returns uuid
language sql stable security definer set search_path = public as
$$ select shift_id from profiles where id = auth.uid() and active $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() = 'owner', false) $$;

-- true for owners, and for managers working in that shift
create or replace function public.can_manage(p_shift uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_owner() or (my_role() = 'manager' and my_shift() = p_shift) $$;

-- ---------------------------------------------------------------- campaigns / clients
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  name text not null,                         -- 'Janitorial US', 'Solar AU', ...
  industry text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shift_id, name)
);

create sequence public.client_code_seq;
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'MVX-' || lpad(nextval('public.client_code_seq')::text, 4, '0'),
  shift_id uuid not null references public.shifts(id),
  campaign_id uuid references public.campaigns(id),
  status text not null default 'Active' check (status in ('Active','Paused','Stopped')),
  company text not null,
  industry text,
  contact_name text,
  designation text,
  phone text,
  email text,                                 -- where leads are sent
  cc_emails text[] not null default '{}',
  website text,
  timezone text,                              -- IANA name, e.g. America/New_York, Australia/Sydney
  coverage_area text,
  services text,
  price_notes text,                           -- "as written", e.g. "$120-$200"
  default_price numeric(10,2),                -- pre-fills each lead's price; editable per lead
  lead_preference text,
  requirements text,
  notes text,
  auto_send_leads boolean not null default true,   -- email lead details the moment it is sent to this client
  send_recordings boolean not null default false,  -- include the call recording in that email
  stripe_customer_id text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- leads
create sequence public.lead_code_seq;
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'LD-' || lpad(nextval('public.lead_code_seq')::text, 4, '0'),
  shift_id uuid not null references public.shifts(id),
  campaign_id uuid references public.campaigns(id),
  agent_id uuid references public.profiles(id),
  agent_name_raw text,                        -- name as typed on old forms (imported data)
  submitted_at timestamptz not null default now(),

  company text not null,
  contact_name text,
  contact_designation text,
  business_type text,
  phone text,
  email text,
  street text, city text, state text, zip text, country text,
  current_type text,                          -- InHouse / Outside
  preferences text,
  appt_at timestamptz,                        -- exact moment of the visit
  appt_timezone text,                         -- shown in the client's local time
  frequency text,
  facility_size text,
  current_provider text,
  agent_notes text,
  extra jsonb not null default '{}',          -- any campaign-specific answers (solar bill, roof type, ...)

  status text not null default 'New – Needs QA' check (status in (
    'New – Needs QA','QA Rejected','QA Approved – Send to Client','Sent to Client',
    'Rebook – Needs New Date','Pass','Decline','Future Resale',
    'Opportunity (can''t sell)','Need to Sell')),
  client_id uuid references public.clients(id),
  sent_at timestamptz,
  client_feedback text,
  decided_at timestamptz,                     -- when it became Pass or Decline (counts toward that month)
  qa_by uuid references public.profiles(id),
  qa_at timestamptz,

  price numeric(10,2),                        -- what we charge for THIS lead, typed by management
  invoice_status text not null default 'Not Invoiced'
    check (invoice_status in ('Not Invoiced','Invoiced','Paid','Not Billable')),
  invoice_number text,
  invoiced_at date,
  paid_at date,
  payment_link_id uuid,

  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_shift_status on public.leads (shift_id, status);
create index leads_agent on public.leads (agent_id, submitted_at);
create index leads_client on public.leads (client_id);
create index leads_appt on public.leads (appt_at);
create index leads_phone on public.leads (regexp_replace(coalesce(phone,''), '\D', '', 'g'));

create table public.lead_recordings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  storage_path text not null,                 -- path inside the private 'recordings' bucket
  file_name text not null,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- history of every change: who did what, when
create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  kind text not null,                         -- status_change, sent, email, note, price, ...
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index lead_events_lead on public.lead_events (lead_id, created_at);

-- ---------------------------------------------------------------- email
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id),   -- null = shared by both shifts (owners only edit)
  campaign_id uuid references public.campaigns(id),
  name text not null,
  subject text not null,                      -- supports {{company}}, {{appt_date}}, ...
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.email_log (
  id bigint generated always as identity primary key,
  shift_id uuid references public.shifts(id),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  to_emails text[] not null,
  subject text not null,
  kind text not null,                         -- lead_to_client, reminder, digest, payment_link
  with_recording boolean not null default false,
  status text not null check (status in ('sent','failed')),
  error text,
  sent_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- tasks / calendar
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  title text not null,
  details text,
  lead_id uuid references public.leads(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  status text not null default 'Open' check (status in ('Open','In Progress','Done')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id),  -- null = company-wide (owners)
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- billing
create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  client_id uuid not null references public.clients(id),
  amount numeric(10,2) not null,
  currency text not null default 'usd',
  description text,
  stripe_link_id text,
  url text,
  status text not null default 'Open' check (status in ('Open','Paid','Cancelled')),
  emailed_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.leads add constraint leads_payment_link_fk
  foreign key (payment_link_id) references public.payment_links(id) on delete set null;

-- ---------------------------------------------------------------- agent pay: bonus and fines
-- Bonus per pass, by level. Default: passes 1-5 earn 500 BDT each, pass 6 onward earns 1000 BDT each.
-- A pass counts toward the month the lead became Pass.
create table public.bonus_rules (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  from_pass int not null check (from_pass > 0),
  amount_per_pass numeric(10,2) not null check (amount_per_pass >= 0),
  currency text not null default 'BDT',
  unique (shift_id, from_pass)
);

-- Manual bonus or fine entries made by management, with a reason the agent can read.
create table public.agent_adjustments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid not null references public.shifts(id),
  month date not null,                        -- first day of the month it counts toward
  kind text not null check (kind in ('bonus','fine')),
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- automatic "what to do next"
-- Same rules as the Google Sheet's Next Action column.
create or replace function public.lead_next_action(l public.leads) returns text
language sql stable as $$
  -- dates are judged in the client's local time zone
  with d as (select (l.appt_at at time zone coalesce(l.appt_timezone, 'UTC'))::date as appt,
                    (now() at time zone coalesce(l.appt_timezone, 'UTC'))::date as today)
  select case
    when l.status = 'New – Needs QA' then 'QA this lead'
    when l.status = 'QA Approved – Send to Client' then 'Send to client'
    when l.status = 'Rebook – Needs New Date' then 'Get new date from client'
    when l.status = 'Sent to Client' then
      case
        when l.client_id is null then 'Pick the client'
        when l.appt_at is null then 'Add appointment date'
        when d.appt < d.today - 2 then 'Feedback OVERDUE'
        when d.appt < d.today then 'Get visit feedback'
        when d.appt <= d.today + 1 then 'Confirm visit with client'
      end
    when l.status = 'Pass' then
      case
        when l.invoice_status in ('Paid','Not Billable') then null
        when l.invoice_status = 'Invoiced' and l.invoiced_at < current_date - 7 then 'Chase payment'
        when l.invoice_status = 'Invoiced' then null
        else 'Invoice client'
      end
  end from d
$$;

-- security_invoker: the view obeys the same shift rules as the leads table
create view public.lead_actions with (security_invoker = true) as
  select l.id, l.code, l.shift_id, l.company, l.client_id, l.agent_id, l.appt_at, l.appt_timezone,
         l.phone, l.status, l.invoiced_at, public.lead_next_action(l) as next_action
  from public.leads l
  where public.lead_next_action(l) is not null;

-- ---------------------------------------------------------------- timestamps + history triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();

-- rebook: once a new date is typed, go back to Sent to Client (same as the sheet)
create or replace function public.lead_rebook() returns trigger language plpgsql as $$
begin
  if new.status in ('Pass','Decline') and new.status is distinct from old.status then
    new.decided_at := now();
  elsif new.status not in ('Pass','Decline') then
    new.decided_at := null;
  end if;
  if new.status = 'Rebook – Needs New Date' and old.status = 'Rebook – Needs New Date'
     and new.appt_at is distinct from old.appt_at and new.appt_at is not null and new.client_id is not null then
    new.status := 'Sent to Client';
  end if;
  return new;
end $$;
create trigger leads_rebook before update on public.leads for each row execute function public.lead_rebook();

create or replace function public.lead_status_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_events (lead_id, actor_id, kind, to_status) values (new.id, auth.uid(), 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into lead_events (lead_id, actor_id, kind, from_status, to_status)
    values (new.id, auth.uid(), 'status_change', old.status, new.status);
  end if;
  return null;
end $$;
create trigger leads_history after insert or update on public.leads
  for each row execute function public.lead_status_history();

-- ---------------------------------------------------------------- agent-facing functions
-- Agents never read the leads table directly. These return only what an agent may see.
create or replace function public.submit_lead(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; v_shift uuid := coalesce(my_shift(), case when is_owner() then (p->>'shift_id')::uuid end);
begin
  if my_role() is null then raise exception 'Not signed in'; end if;
  if v_shift is null then raise exception 'Choose a shift'; end if;
  if coalesce(trim(p->>'company'),'') = '' then raise exception 'Company is required'; end if;
  insert into leads (shift_id, campaign_id, agent_id, company, contact_name, contact_designation, business_type,
                     phone, email, street, city, state, zip, country, appt_at, appt_timezone, frequency,
                     facility_size, current_type, preferences, current_provider, agent_notes, extra, source)
  values (v_shift,
          (select id from campaigns where id = nullif(p->>'campaign_id','')::uuid and shift_id = v_shift),
          auth.uid(), p->>'company', p->>'contact_name', p->>'contact_designation', p->>'business_type',
          p->>'phone', p->>'email', p->>'street', p->>'city', p->>'state', p->>'zip', p->>'country',
          nullif(p->>'appt_at','')::timestamptz, p->>'appt_timezone', p->>'frequency',
          p->>'facility_size', p->>'current_type', p->>'preferences', p->>'current_provider', p->>'agent_notes',
          coalesce(p->'extra','{}'::jsonb), 'CRM form')
  returning code into v_code;
  return v_code;
end $$;

create or replace function public.my_leads()
returns table (code text, submitted_at timestamptz, company text, city text, state text,
               appt_at timestamptz, status text, client_feedback text)
language sql stable security definer set search_path = public as $$
  select code, submitted_at, company, city, state, appt_at,
         -- agents see the outcome, not internal steps
         case when status in ('Pass','Decline','QA Rejected') then status
              when status = 'Rebook – Needs New Date' then 'Rebooking'
              else 'In progress' end,
         case when status in ('Decline','QA Rejected') then client_feedback end
  from leads where agent_id = auth.uid() order by submitted_at desc
$$;

create or replace function public.agent_month(p_agent uuid, p_month date)
returns table (leads int, passes int, declines int, auto_bonus numeric, manual_bonus numeric, fines numeric, total numeric)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start),
  a as (select * from profiles where id = p_agent),
  ok as (select (p_agent = auth.uid()) or can_manage((select shift_id from a)) as allowed),
  counts as (
    select
      (select count(*) from leads, m where agent_id = p_agent
         and submitted_at >= m.start and submitted_at < m.start + interval '1 month')::int as leads,
      (select count(*) from leads, m where agent_id = p_agent and status = 'Pass'
         and decided_at >= m.start and decided_at < m.start + interval '1 month')::int as passes,
      (select count(*) from leads, m where agent_id = p_agent and status = 'Decline'
         and decided_at >= m.start and decided_at < m.start + interval '1 month')::int as declines),
  -- pass number n earns the rate of the highest level whose from_pass <= n
  rule as (
    select coalesce(sum((select r.amount_per_pass from bonus_rules r, a
                          where r.shift_id = a.shift_id and r.from_pass <= n
                          order by r.from_pass desc limit 1)), 0) as amt
    from counts, generate_series(1, counts.passes) n),
  adj as (
    select coalesce(sum(amount) filter (where kind='bonus'),0) as bonus,
           coalesce(sum(amount) filter (where kind='fine'),0) as fine
    from agent_adjustments, m where agent_id = p_agent and month = m.start)
  select counts.leads, counts.passes, counts.declines, rule.amt, adj.bonus, adj.fine,
         rule.amt + adj.bonus - adj.fine
  from counts, rule, adj, ok where ok.allowed
$$;

-- may this user attach a recording to this lead? (agent who submitted it, or its managers)
create or replace function public.can_attach(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leads l where l.id = p_lead and (l.agent_id = auth.uid() or can_manage(l.shift_id)))
$$;

-- ---------------------------------------------------------------- row level security
alter table public.shifts enable row level security;
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.lead_recordings enable row level security;
alter table public.lead_events enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_log enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.payment_links enable row level security;
alter table public.bonus_rules enable row level security;
alter table public.agent_adjustments enable row level security;

-- shifts: everyone signed in can see the list; owners edit
create policy shifts_read on public.shifts for select to authenticated using (true);
create policy shifts_write on public.shifts for all to authenticated using (is_owner()) with check (is_owner());

-- profiles: see yourself; managers see their shift; owners everything. Only owners create/edit logins.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or can_manage(shift_id));
create policy profiles_write on public.profiles for all to authenticated using (is_owner()) with check (is_owner());

-- campaigns: agents can see their shift's campaigns (for the form dropdown)
create policy campaigns_read on public.campaigns for select to authenticated
  using (can_manage(shift_id) or shift_id = my_shift());
create policy campaigns_write on public.campaigns for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));

-- shift-scoped tables: managers of that shift + owners, full access
create policy clients_all on public.clients for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy leads_all on public.leads for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy tasks_all on public.tasks for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy payment_links_all on public.payment_links for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy bonus_rules_all on public.bonus_rules for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy email_log_read on public.email_log for select to authenticated using (can_manage(shift_id));

create policy adjustments_manage on public.agent_adjustments for all to authenticated
  using (can_manage(shift_id)) with check (can_manage(shift_id));
create policy adjustments_own on public.agent_adjustments for select to authenticated
  using (agent_id = auth.uid());

create policy events_all on public.events for all to authenticated
  using (case when shift_id is null then my_role() in ('owner','manager') else can_manage(shift_id) end)
  with check (case when shift_id is null then is_owner() else can_manage(shift_id) end);

create policy templates_read on public.email_templates for select to authenticated
  using (shift_id is null and my_role() in ('owner','manager') or can_manage(shift_id));
create policy templates_write on public.email_templates for all to authenticated
  using (case when shift_id is null then is_owner() else can_manage(shift_id) end)
  with check (case when shift_id is null then is_owner() else can_manage(shift_id) end);

-- child rows follow their lead
create policy recordings_all on public.lead_recordings for all to authenticated
  using (exists (select 1 from leads l where l.id = lead_id and can_manage(l.shift_id)))
  with check (exists (select 1 from leads l where l.id = lead_id and can_manage(l.shift_id)));
create policy recordings_agent_insert on public.lead_recordings for insert to authenticated
  with check (can_attach(lead_id) and uploaded_by = auth.uid());
create policy events_read on public.lead_events for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_id and can_manage(l.shift_id)));
create policy events_note on public.lead_events for insert to authenticated
  with check (exists (select 1 from leads l where l.id = lead_id and can_manage(l.shift_id)));

-- ---------------------------------------------------------------- call recordings storage (private)
insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 52428800)  -- 50 MB per file (free-plan maximum)
on conflict (id) do nothing;

-- files are stored as <lead_id>/<file name>
create policy recordings_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
    and public.can_attach(nullif((storage.foldername(name))[1], '')::uuid));
create policy recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and exists (
    select 1 from public.leads l where l.id::text = (storage.foldername(name))[1]
      and public.can_manage(l.shift_id)));
create policy recordings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and exists (
    select 1 from public.leads l where l.id::text = (storage.foldername(name))[1]
      and public.can_manage(l.shift_id)));

-- ---------------------------------------------------------------- lock down function access
revoke execute on function public.submit_lead(jsonb) from public, anon;
revoke execute on function public.my_leads() from public, anon;
revoke execute on function public.agent_month(uuid, date) from public, anon;
grant execute on function public.submit_lead(jsonb), public.my_leads(), public.agent_month(uuid, date) to authenticated;

-- ---------------------------------------------------------------- starting data
insert into public.shifts (name, timezone, from_email) values
  ('US Night Shift', 'Asia/Dhaka', 'sales@wearemorvix.com'),
  ('Australia Shift', 'Asia/Dhaka', 'info@wearemorvix.com');

insert into public.bonus_rules (shift_id, from_pass, amount_per_pass)
  select id, x.from_pass, x.amt from public.shifts, (values (1, 500), (6, 1000)) as x(from_pass, amt);

-- Default lead email (same wording the team sends today). {{placeholders}} are filled from the lead and client.
insert into public.email_templates (shift_id, name, subject, body, is_default) values (null, 'Lead to client', 'New Appointment: {{company}} - {{appt_date_short}}',
'Hello {{client_first_name}},

Here is the appointment information. Please find the lead details below.

Company Name: {{company}}
Industry Type: {{business_type}}
Address: {{address}}

PoC Name: {{contact_name}}
PoC Designation: {{contact_designation}}
Phone Number: {{phone}}
E-mail: {{email}}

Current Type: {{current_type}}
Frequency: {{frequency}}
Preferences: {{preferences}}
Facility Size: {{facility_size}}
Appointment Date: {{appt_date_long}}

Note: {{agent_notes}}

Please review the information above. Let me know if you have any questions.

Thank you,
{{sender_name}}
Morvix LLC', true);
