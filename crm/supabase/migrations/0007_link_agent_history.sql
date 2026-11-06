-- Imported leads carry the agent's name as text (agent_name_raw). When an owner creates or edits an agent
-- whose name or "old form names" match, attach that history to the login so it counts in their results.
create or replace function public.link_agent_history(p_agent uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; p profiles;
begin
  if not is_owner() then raise exception 'Only owners can link agent history'; end if;
  select * into p from profiles where id = p_agent and role = 'agent';
  if not found then return 0; end if;
  update leads set agent_id = p.id
  where agent_id is null and shift_id = p.shift_id
    and lower(trim(agent_name_raw)) in (select lower(trim(x)) from unnest(array_append(p.aliases, p.full_name)) x);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.link_agent_history(uuid) from public, anon;
grant execute on function public.link_agent_history(uuid) to authenticated;
