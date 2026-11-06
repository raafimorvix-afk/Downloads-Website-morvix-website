-- BDM tracking, owner-only bonus control, and owner-managed staff logins.

-- ---------------------------------------------------------------- BDM: who onboarded each client
alter table public.clients add column onboarded_by uuid references public.profiles(id);
create index clients_onboarded_by on public.clients (onboarded_by);

-- Owners decide the BDM bonus each month (it changes month to month).
create table public.bdm_bonuses (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,                              -- first day of the month
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'BDT',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (manager_id, month)
);
alter table public.bdm_bonuses enable row level security;
create policy bdm_bonuses_owner on public.bdm_bonuses for all to authenticated
  using (is_owner()) with check (is_owner());
create policy bdm_bonuses_own on public.bdm_bonuses for select to authenticated
  using (manager_id = auth.uid());

-- Revenue from each manager's onboarded clients for a month.
-- billed = price of leads that became Pass that month; paid = of those, marked Paid.
-- Owners see every manager; a manager sees only their own row.
create or replace function public.bdm_month(p_month date)
returns table (manager_id uuid, manager_name text, clients_onboarded int, passes int,
               billed numeric, paid numeric, bonus numeric, bonus_note text)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start)
  select p.id, p.full_name,
    (select count(*) from clients c where c.onboarded_by = p.id)::int,
    count(l.id)::int,
    coalesce(sum(l.price), 0),
    coalesce(sum(l.price) filter (where l.invoice_status = 'Paid'), 0),
    b.amount, b.note
  from profiles p
  cross join m
  left join clients c on c.onboarded_by = p.id
  left join leads l on l.client_id = c.id and l.status = 'Pass'
       and l.decided_at >= m.start and l.decided_at < m.start + interval '1 month'
  left join bdm_bonuses b on b.manager_id = p.id and b.month = m.start
  where p.role = 'manager' and p.active and (is_owner() or p.id = auth.uid())
  group by p.id, p.full_name, b.amount, b.note
  order by p.full_name
$$;
revoke execute on function public.bdm_month(date) from public, anon;
grant execute on function public.bdm_month(date) to authenticated;

-- ---------------------------------------------------------------- tighten who sets pay
-- Bonus rates: owners change them; managers can only read their shift's rates.
drop policy bonus_rules_all on public.bonus_rules;
create policy bonus_rules_read on public.bonus_rules for select to authenticated using (can_manage(shift_id));
create policy bonus_rules_owner on public.bonus_rules for all to authenticated using (is_owner()) with check (is_owner());

-- Fines / extra bonus: managers only for AGENTS in their own shift (never themselves). Owners anyone.
create or replace function public.is_agent_in_shift(p_agent uuid, p_shift uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_agent and role = 'agent' and shift_id = p_shift)
$$;
revoke execute on function public.is_agent_in_shift(uuid, uuid) from public, anon;
grant execute on function public.is_agent_in_shift(uuid, uuid) to authenticated;

drop policy adjustments_manage on public.agent_adjustments;
create policy adjustments_manage on public.agent_adjustments for all to authenticated
  using (can_manage(shift_id))
  with check (is_owner() or (can_manage(shift_id) and agent_id <> auth.uid()
                             and is_agent_in_shift(agent_id, shift_id)));

-- ---------------------------------------------------------------- staff logins (owners only)
-- Creates a sign-in for a manager, agent or owner. No paid email service needed:
-- the owner sets a starting password and gives it to the person.
create or replace function public.create_staff(p_email text, p_password text, p_full_name text,
                                               p_role text, p_shift uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  if not is_owner() then raise exception 'Only owners can add staff'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Name is required'; end if;
  if p_role not in ('owner','manager','agent') then raise exception 'Choose a role'; end if;
  if p_role <> 'owner' and p_shift is null then raise exception 'Choose a shift'; end if;
  if exists (select 1 from auth.users where email = v_email) then raise exception 'That email already has a login'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into profiles (id, full_name, email, role, shift_id)
  values (v_id, trim(p_full_name), v_email, p_role, case when p_role = 'owner' then null else p_shift end);
  return v_id;
end $$;

create or replace function public.set_staff_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_owner() then raise exception 'Only owners can reset passwords'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'User not found'; end if;
end $$;

-- deactivated staff are also signed out everywhere
create or replace function public.staff_deactivated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_deactivate after update of active on public.profiles
  for each row execute function public.staff_deactivated();

revoke execute on function public.create_staff(text, text, text, text, uuid) from public, anon;
revoke execute on function public.set_staff_password(uuid, text) from public, anon;
revoke execute on function public.staff_deactivated() from public, anon, authenticated;
grant execute on function public.create_staff(text, text, text, text, uuid), public.set_staff_password(uuid, text) to authenticated;
