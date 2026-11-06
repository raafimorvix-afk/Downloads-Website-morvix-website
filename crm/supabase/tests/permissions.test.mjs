import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
// Supabase stand-ins
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema public, auth, storage to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
grant all on storage.objects to authenticated;
`);
for (const f of fs.readdirSync(new URL("../migrations/", import.meta.url)).sort()) await db.exec(fs.readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"));
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant execute on all functions in schema auth to authenticated;`);

const ids = { owner: '00000000-0000-0000-0000-000000000001', night: '00000000-0000-0000-0000-000000000002',
  day: '00000000-0000-0000-0000-000000000003', agent: '00000000-0000-0000-0000-000000000004', agent2: '00000000-0000-0000-0000-000000000005' };
const [N, A] = (await q(`select id from shifts order by name desc`)).rows.map(r => r.id); // US Night, Australia
for (const id of Object.values(ids)) await q(`insert into auth.users values ($1)`, [id]);
await q(`insert into profiles (id, full_name, email, role, shift_id) values
 ($1,'Owner','o@x','owner',null), ($2,'Night Mgr','n@x','manager',$6), ($3,'Day Mgr','d@x','manager',$7),
 ($4,'Agent Night','a@x','agent',$6), ($5,'Agent Day','b@x','agent',$7)`, [ids.owner, ids.night, ids.day, ids.agent, ids.agent2, N, A]);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
async function as(who, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub','${ids[who]}',false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.sub','',false);`); }
}
const tryq = async (s, p) => { try { return await q(s, p); } catch (e) { return { error: e.message }; } };

// setup data as owner
await as('owner', async () => {
  await q(`insert into campaigns (shift_id, name) values ($1,'Janitorial US'), ($2,'Solar AU')`, [N, A]);
  await q(`insert into clients (shift_id, company, email, default_price) values ($1,'Finishing Touch','c1@x',100), ($2,'Sydney Solar','c2@x',300)`, [N, A]);
});

// agent submits
const code = await as('agent', async () => (await q(`select submit_lead($1::jsonb)->>'code' as c`, [JSON.stringify({ company: 'Anytime Fitness', phone: '+1 614', appt_local: '2026-11-10T10:00', appt_timezone: 'America/New_York' })])).rows[0].c);
const apptUtc = (await q(`select appt_at at time zone 'UTC' as t from leads where code='LD-0001'`)).rows[0].t;
ok(new Date(apptUtc).getUTCHours() === 15, 'appointment 10:00 New York stored as 15:00 UTC');
ok(code === 'LD-0001', 'agent can submit a lead -> ' + code);
await as('agent2', async () => q(`select submit_lead($1::jsonb)`, [JSON.stringify({ company: 'Aussie Office', phone: '+61 2' })]));
ok(!!(await as('agent', () => tryq(`select submit_lead($1::jsonb)`, [JSON.stringify({ company: 'No phone' })]))).error, 'lead without phone is rejected');

ok((await as('agent', () => q(`select * from leads`))).rows.length === 0, 'agent cannot read leads table directly');
ok((await as('agent', () => q(`select * from clients`))).rows.length === 0, 'agent cannot read clients');
ok((await as('agent', () => q(`select * from my_leads()`))).rows.length === 1, 'agent sees own lead via my_leads');
ok((await as('agent', () => q(`update leads set status='Pass'`))).affectedRows === 0, 'agent cannot change any lead');
ok((await as('night', () => q(`select company from leads`))).rows.map(r => r.company).join() === 'Anytime Fitness', 'night manager sees only night lead');
ok((await as('day', () => q(`select company from leads`))).rows.map(r => r.company).join() === 'Aussie Office', 'day manager sees only day lead');
ok((await as('day', () => q(`select company from clients`))).rows.map(r => r.company).join() === 'Sydney Solar', 'day manager sees only day clients');
ok((await as('owner', () => q(`select * from leads`))).rows.length === 2, 'owner sees all leads');
const cross = await as('night', () => tryq(`insert into clients (shift_id, company) values ($1,'sneaky')`, [A]));
ok(!!cross.error, 'night manager cannot create a client in day shift');
const upd = await as('night', () => q(`update leads set status='Pass' where company='Aussie Office'`));
ok(upd.affectedRows === 0, 'night manager cannot edit day lead');

// workflow
const n = await as('night', async () => {
  const c = (await q(`select id from clients where company='Finishing Touch'`)).rows[0].id;
  await q(`update leads set status='QA Approved – Send to Client' where code='LD-0001'`);
  let a = (await q(`select next_action from lead_actions where code='LD-0001'`)).rows[0]?.next_action;
  await q(`update leads set status='Sent to Client', client_id=$1, appt_at = now() - interval '5 days' where code='LD-0001'`, [c]);
  const b = (await q(`select next_action from lead_actions where code='LD-0001'`)).rows[0]?.next_action;
  await q(`update leads set status='Rebook – Needs New Date' where code='LD-0001'`);
  await q(`update leads set appt_at = now() + interval '12 hours' where code='LD-0001'`);
  const r = (await q(`select status from leads where code='LD-0001'`)).rows[0].status;
  const cc = (await q(`select next_action from lead_actions where code='LD-0001'`)).rows[0]?.next_action;
  await q(`update leads set status='Pass', price=100 where code='LD-0001'`);
  const p = (await q(`select next_action from lead_actions where code='LD-0001'`)).rows[0]?.next_action;
  const h = (await q(`select count(*)::int c from lead_events`)).rows[0].c;
  return { a, b, r, cc, p, h };
});
ok(n.a === 'Send to client', 'next action after QA: ' + n.a);
ok(n.b === 'Feedback OVERDUE', 'overdue feedback detected: ' + n.b);
ok(n.r === 'Sent to Client', 'rebook + new date flips back to Sent to Client');
ok(n.cc === 'Confirm visit with client', 'confirm visit reminder: ' + n.cc);
ok(n.p === 'Invoice client', 'pass -> invoice client');
ok(n.h >= 6, 'status history recorded: ' + n.h + ' events');
const agentView = (await as('agent', () => q(`select status from my_leads()`))).rows[0].status;
ok(agentView === 'Pass', 'agent sees the Pass result');

// bonus + fines
await as('night', async () => {
  await q(`insert into agent_adjustments (agent_id, shift_id, month, kind, amount, reason) values ($1,$2,date_trunc('month',now())::date,'fine',200,'Late')`, [ids.agent, N]);
});
const m = (await as('agent', () => q(`select * from agent_month($1, current_date)`, [ids.agent]))).rows[0];
ok(m && Number(m.passes) === 1 && Number(m.total) === 300, `agent month: passes=${m?.passes} bonus=${m?.auto_bonus} fine=${m?.fines} total=${m?.total}`);
ok((await as('agent', () => q(`select * from agent_month($1, current_date)`, [ids.agent2]))).rows.length === 0, 'agent cannot see another agent month');
ok((await as('day', () => q(`select * from agent_month($1, current_date)`, [ids.agent]))).rows.length === 0, 'day manager cannot see night agent month');
ok((await as('agent', () => q(`select * from agent_adjustments`))).rows.length === 1, 'agent sees own fine with reason');

// recordings
const lid = (await q(`select id from leads where code='LD-0001'`)).rows[0].id;
const up = await as('agent', () => tryq(`insert into storage.objects (bucket_id, name) values ('recordings', $1)`, [lid + '/call.mp3']));
ok(!up.error, 'agent can upload recording to own lead ' + (up.error || ''));
const up2 = await as('agent2', () => tryq(`insert into storage.objects (bucket_id, name) values ('recordings', $1)`, [lid + '/x.mp3']));
ok(!!up2.error, 'other agent cannot upload to that lead');
ok((await as('day', () => q(`select * from storage.objects`))).rows.length === 0, 'day manager cannot see night recordings');
ok((await as('night', () => q(`select * from storage.objects`))).rows.length === 1, 'night manager can see night recordings');

// bonus levels: 7 passes = 5 x 500 + 2 x 1000 = 4500
await as('night', async () => {
  for (let i = 0; i < 6; i++) {
    const c = (await q(`insert into leads (shift_id, agent_id, company) values ($1,$2,'Extra ${'$'}{i}') returning id`, [N, ids.agent])).rows[0].id;
    await q(`update leads set status='Pass' where id=$1`, [c]);
  }
});
const m7 = (await as('agent', () => q(`select * from agent_month($1, current_date)`, [ids.agent]))).rows[0];
ok(Number(m7.passes) === 7 && Number(m7.auto_bonus) === 4500, `7 passes -> bonus ${m7.auto_bonus} (expect 4500)`);
const lastMonth = (await as('agent', () => q(`select * from agent_month($1, (current_date - interval '1 month')::date)`, [ids.agent]))).rows[0];
ok(Number(lastMonth.passes) === 0, 'passes do not leak into other months');
const tpl = (await as('night', () => q(`select count(*)::int c from email_templates`))).rows[0].c;
ok(tpl === 1, 'managers can read the shared lead email template');
ok((await as('agent', () => q(`select * from email_templates`))).rows.length === 0, 'agents cannot read email templates');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
