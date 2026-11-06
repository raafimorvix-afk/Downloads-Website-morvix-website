-- Invites by email, one-click client feedback, dashboard statistics, unlinked agent names,
-- client currency, and server-only functions (daily digest, Stripe payment confirmation).

-- ---------------------------------------------------------------- email subject (management's format)
update public.email_templates
   set subject = 'New Appointment – {{company}} – {{appt_date_long}}'
 where is_default and name = 'Lead to client';

-- ---------------------------------------------------------------- server-only secret
-- A private schema that the API never exposes. The same value is set as SERVER_SECRET on Vercel,
-- so only our own server (cron job, Stripe webhook) can call the server_* functions below.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);

create or replace function private.server_ok(p_secret text) returns boolean
language sql stable security definer set search_path = private as $$
  select exists (select 1 from private.settings where key = 'server_secret' and value = p_secret and length(p_secret) >= 32)
$$;

-- ---------------------------------------------------------------- staff invites
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.staff_invites enable row level security;
create policy invites_owner_read on public.staff_invites for select to authenticated using (is_owner());

-- create_staff: password is now optional (people set their own from the invite email)
create or replace function public.create_staff(p_email text, p_password text, p_full_name text,
                                               p_role text, p_shift uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
        v_pw text := coalesce(nullif(p_password, ''), replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
begin
  if not is_owner() then raise exception 'Only owners can add staff'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if length(v_pw) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Name is required'; end if;
  if p_role not in ('owner','manager','agent') then raise exception 'Choose a role'; end if;
  if p_role <> 'owner' and p_shift is null then raise exception 'Choose a shift'; end if;
  if exists (select 1 from auth.users where email = v_email) then raise exception 'That email already has a login'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(v_pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into profiles (id, full_name, email, role, shift_id)
  values (v_id, trim(p_full_name), v_email, p_role, case when p_role = 'owner' then null else p_shift end);
  return v_id;
end $$;

-- Owner creates a one-time link (valid 7 days). Only a hash is stored; the token is shown once.
create or replace function public.create_invite(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not is_owner() then raise exception 'Only owners can invite staff'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'User not found'; end if;
  update staff_invites set used_at = now() where user_id = p_user and used_at is null;  -- old links stop working
  insert into staff_invites (user_id, token_hash, created_by)
  values (p_user, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  return v_token;
end $$;

-- Anyone holding a valid link can see who it is for, and set the password once.
create or replace function public.invite_info(p_token text)
returns table (full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.full_name, p.email, p.role from staff_invites i join profiles p on p.id = i.user_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and i.used_at is null and i.expires_at > now() and p.active
$$;

create or replace function public.accept_invite(p_token text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_inv staff_invites; v_email text;
begin
  select * into v_inv from staff_invites
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and used_at is null and expires_at > now() for update;
  if not found then raise exception 'This link has expired or was already used. Ask an owner for a new one.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_inv.user_id;
  update staff_invites set used_at = now() where id = v_inv.id;
  select email into v_email from profiles where id = v_inv.user_id;
  return v_email;
end $$;

-- ---------------------------------------------------------------- client one-click feedback
alter table public.leads add column feedback_token uuid not null default gen_random_uuid();
create unique index leads_feedback_token on public.leads (feedback_token);

create or replace function public.feedback_info(p_token uuid)
returns table (code text, company text, city text, state text, appt_at timestamptz, appt_timezone text,
               client_company text, status text, can_respond boolean)
language sql stable security definer set search_path = public as $$
  select l.code, l.company, l.city, l.state, l.appt_at, l.appt_timezone, c.company, l.status,
         l.status in ('Sent to Client', 'Rebook – Needs New Date')
  from leads l join clients c on c.id = l.client_id where l.feedback_token = p_token
$$;

create or replace function public.feedback_submit(p_token uuid, p_result text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare l leads; v_status text;
begin
  select * into l from leads where feedback_token = p_token and client_id is not null for update;
  if not found then raise exception 'Link not valid'; end if;
  if l.status not in ('Sent to Client', 'Rebook – Needs New Date') then
    raise exception 'Thanks, we already have your feedback for this appointment.';
  end if;
  v_status := case p_result when 'pass' then 'Pass' when 'decline' then 'Decline'
                            when 'reschedule' then 'Rebook – Needs New Date' end;
  if v_status is null then raise exception 'Choose a result'; end if;
  update leads set status = v_status,
         client_feedback = coalesce(nullif(trim(left(p_note, 2000)), ''), client_feedback)
   where id = l.id;
  insert into lead_events (lead_id, kind, note)
  values (l.id, 'client_feedback', 'Client answered from the email link: ' || v_status ||
          coalesce(' – "' || nullif(trim(left(p_note, 500)), '') || '"', ''));
  return v_status;
end $$;

-- ---------------------------------------------------------------- duplicates (same phone digits)
create or replace function public.lead_duplicates(p_lead uuid)
returns table (id uuid, code text, company text, status text, submitted_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with me as (select right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) as digits from leads where id = p_lead)
  select l.id, l.code, l.company, l.status, l.submitted_at from leads l, me
  where l.id <> p_lead and length(me.digits) >= 7
    and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = me.digits
  order by l.submitted_at desc limit 10
$$;

-- warn agents at submit time (they can't read other leads, so this only returns a count)
create or replace function public.phone_seen_count(p_phone text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from leads
  where length(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)) >= 7
    and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)
    and submitted_at > now() - interval '180 days'
$$;

-- ---------------------------------------------------------------- dashboard statistics (obeys shift rules)
create or replace function public.dashboard_stats(p_shift uuid, p_start date, p_end date) returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select * from leads where (p_shift is null or shift_id = p_shift)
  ),
  days as (select generate_series(p_start, p_end - 1, interval '1 day')::date d),
  sub as (select (submitted_at at time zone 'Asia/Dhaka')::date d, count(*) n from l
          where submitted_at >= p_start and submitted_at < p_end group by 1),
  dec as (select (decided_at at time zone 'Asia/Dhaka')::date d,
                 count(*) filter (where status = 'Pass') p, count(*) filter (where status = 'Decline') x
          from l where decided_at >= p_start and decided_at < p_end group by 1),
  decided as (select * from l where decided_at >= p_start and decided_at < p_end)
  select jsonb_build_object(
    'daily', (select jsonb_agg(jsonb_build_object('d', days.d, 'submitted', coalesce(sub.n, 0),
                                                  'passes', coalesce(dec.p, 0), 'declines', coalesce(dec.x, 0)) order by days.d)
              from days left join sub using (d) left join dec using (d)),
    'pipeline', (select jsonb_build_object(
        'qa', count(*) filter (where status = 'New – Needs QA'),
        'to_send', count(*) filter (where status = 'QA Approved – Send to Client'),
        'with_clients', count(*) filter (where status = 'Sent to Client'),
        'rebook', count(*) filter (where status = 'Rebook – Needs New Date'),
        'resale', count(*) filter (where status in ('Future Resale', 'Need to Sell', 'Opportunity (can''t sell)'))) from l),
    'clients', (select coalesce(jsonb_agg(x order by x.passes desc, x.declines desc), '[]') from (
        select c.company name, count(*) filter (where d.status = 'Pass') passes,
               count(*) filter (where d.status = 'Decline') declines,
               coalesce(sum(d.price) filter (where d.status = 'Pass'), 0) billed
        from decided d join clients c on c.id = d.client_id group by c.company limit 10) x),
    'agents', (select coalesce(jsonb_agg(x order by x.passes desc, x.declines) , '[]') from (
        select coalesce(p.full_name, nullif(trim(d.agent_name_raw), ''), 'Unknown') name,
               count(*) filter (where d.status = 'Pass') passes, count(*) filter (where d.status = 'Decline') declines
        from decided d left join profiles p on p.id = d.agent_id group by 1 order by 2 desc limit 10) x),
    'billed', (select coalesce(sum(price), 0) from decided where status = 'Pass'),
    'paid', (select coalesce(sum(price), 0) from decided where status = 'Pass' and invoice_status = 'Paid'),
    'unpaid_all', (select coalesce(sum(price), 0) from l where status = 'Pass' and invoice_status = 'Invoiced')
  )
$$;
revoke execute on function public.dashboard_stats(uuid, date, date) from public, anon;
grant execute on function public.dashboard_stats(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------- old agent names nobody is linked to
create or replace function public.unlinked_agent_names()
returns table (shift_id uuid, shift_name text, name text, leads int)
language sql stable security definer set search_path = public as $$
  select l.shift_id, s.name, trim(l.agent_name_raw), count(*)::int
  from leads l join shifts s on s.id = l.shift_id
  where is_owner() and l.agent_id is null and coalesce(trim(l.agent_name_raw), '') <> ''
  group by 1, 2, 3 order by 4 desc
$$;

-- ---------------------------------------------------------------- client currency (US = usd, Australia = aud)
alter table public.clients add column currency text not null default 'usd' check (currency in ('usd', 'aud'));
update public.clients set currency = 'aud' where shift_id = (select id from public.shifts where name = 'Australia Shift');
alter table public.payment_links add column stripe_session_id text, add column lead_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------- server-only functions
-- Daily digest: what each shift has to do today, and who should receive it.
create or replace function public.server_digest(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.server_ok(p_secret) then raise exception 'not allowed'; end if;
  return (select jsonb_agg(jsonb_build_object(
    'shift', s.name, 'from_email', s.from_email,
    'to', (select coalesce(jsonb_agg(p.email), '[]') from profiles p
           where p.active and (p.role = 'owner' or (p.role = 'manager' and p.shift_id = s.id))),
    'actions', (select coalesce(jsonb_object_agg(next_action, n), '{}') from
                (select next_action, count(*) n from lead_actions a where a.shift_id = s.id group by 1) x),
    'overdue', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'company', company, 'appt_at', appt_at)), '[]') from
                (select code, company, appt_at from lead_actions a where a.shift_id = s.id
                 and next_action = 'Feedback OVERDUE' order by appt_at desc limit 15) o),
    'yesterday', (select jsonb_build_object(
        'submitted', count(*) filter (where submitted_at >= now() - interval '1 day'),
        'passes', count(*) filter (where status = 'Pass' and decided_at >= now() - interval '1 day'),
        'declines', count(*) filter (where status = 'Decline' and decided_at >= now() - interval '1 day'))
      from leads where shift_id = s.id)
  )) from shifts s);
end $$;

-- Stripe webhook: a payment link was paid -> mark the link and its leads Paid.
create or replace function public.server_mark_paid(p_secret text, p_link uuid, p_session text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not private.server_ok(p_secret) then raise exception 'not allowed'; end if;
  update payment_links set status = 'Paid', paid_at = now(), stripe_session_id = p_session
   where id = p_link and status <> 'Paid';
  update leads set invoice_status = 'Paid', paid_at = current_date
   where payment_link_id = p_link and invoice_status <> 'Paid';
  get diagnostics v_count = row_count;
  insert into lead_events (lead_id, kind, note)
    select id, 'payment', 'Paid through Stripe' from leads where payment_link_id = p_link;
  return v_count;
end $$;

-- ---------------------------------------------------------------- function access
revoke execute on function public.create_invite(uuid), public.unlinked_agent_names(), public.lead_duplicates(uuid),
  public.phone_seen_count(text) from public, anon;
grant execute on function public.create_invite(uuid), public.unlinked_agent_names(), public.lead_duplicates(uuid),
  public.phone_seen_count(text) to authenticated;
-- these are reached without a login (the link or the secret is the key)
grant execute on function public.invite_info(text), public.accept_invite(text, text),
  public.feedback_info(uuid), public.feedback_submit(uuid, text, text),
  public.server_digest(text), public.server_mark_paid(text, uuid, text) to anon, authenticated;
revoke execute on function private.server_ok(text) from public, anon, authenticated;
