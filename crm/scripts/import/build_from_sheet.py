"""Reads the night-shift tracker .xlsx and writes clean JSON for clients and leads."""
import json, re, sys, datetime as dt, collections
from zoneinfo import ZoneInfo
import openpyxl

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
ws, cl = wb['Leads'], wb['Clients']

def s(v):
    if v is None: return None
    if isinstance(v, float) and v.is_integer(): v = int(v)
    t = str(v).strip()
    return None if t in ('', 'N/A', 'n/a', 'NA', 'None') else t

def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    m = re.search(r'\d[\d,]*(\.\d+)?', str(v))
    return float(m.group(0).replace(',', '')) if m else None

TZ_LABEL = {'us eastern (et)': 'America/New_York', 'est': 'America/New_York', 'us central (ct)': 'America/Chicago',
            'us mountain (mt)': 'America/Denver', 'us pacific (pt)': 'America/Los_Angeles'}
STATE_TZ = {}
for st in 'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV'.split(): STATE_TZ[st] = 'America/New_York'
for st in 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI'.split(): STATE_TZ[st] = 'America/Chicago'
for st in 'CO ID MT NM UT WY'.split(): STATE_TZ[st] = 'America/Denver'
STATE_TZ.update({'AZ': 'America/Phoenix', 'CA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles', 'OR': 'America/Los_Angeles',
                 'WA': 'America/Los_Angeles', 'AK': 'America/Anchorage', 'HI': 'Pacific/Honolulu', 'PR': 'America/Puerto_Rico'})
NAMES = {'florida': 'FL', 'texas': 'TX', 'california': 'CA', 'new york': 'NY', 'ohio': 'OH', 'georgia': 'GA'}

def state_code(v):
    t = (s(v) or '').strip()
    if len(t) == 2: return t.upper()
    return NAMES.get(t.lower(), t.upper()[:2] if t else None)

# ---------------- clients
clients, by_name = [], {}
for r in cl.iter_rows(min_row=2, values_only=True):
    if not s(r[2]): continue
    tz = TZ_LABEL.get((s(r[9]) or '').lower())
    notes = '\n'.join(x for x in [s(r[17]), f"Added by (sheet): {s(r[16])}" if s(r[16]) else None,
                                  f"Time zone (sheet): {s(r[9])}" if s(r[9]) and not tz else None] if x)
    c = dict(code=s(r[0]), status=s(r[1]) if s(r[1]) in ('Active', 'Paused', 'Stopped') else 'Active', company=s(r[2]),
             industry=s(r[3]), contact_name=s(r[4]), designation=s(r[5]), phone=s(r[6]), email=s(r[7]), website=s(r[8]),
             timezone=tz, coverage_area=s(r[10]), services=s(r[11]), price_notes=s(r[12]), default_price=num(r[13]),
             lead_preference=s(r[14]), requirements=s(r[15]), notes=notes or None,
             auto_send_leads=False)  # switched off for imported clients until the team checks each email address
    clients.append(c); by_name[c['company'].lower()] = c

# ---------------- leads
phone_like = lambda v: v is not None and bool(re.fullmatch(r'[+\d\s().\-]{7,}', str(v).strip()))
leads, shifted, missing_clients = [], [], collections.Counter()
alias = {'luis': 'Luis Torres', 'lucas': 'Lucas Torres', 'eric': 'Eric Stain'}
for row in ws.iter_rows(min_row=2, values_only=True):
    r = list(row)
    if not s(r[0]): continue
    # four early rows were pasted one block to the right: re-align them
    if r[6] and not phone_like(r[6]) and phone_like(r[8]):
        shifted.append(r[0])
        notes, zip_, ph, street, city, st = r[6], r[7], r[8], r[9], r[10], r[11]
        appt_d, appt_t, freq, cur, size = r[13], r[14], r[16], r[17], r[18]
        r[6], r[7], r[8], r[9], r[10], r[11] = ph, None, street, city, st, zip_
        r[12], r[13], r[14], r[15], r[16], r[17], r[18] = appt_d, appt_t, freq, None, size, cur, notes
    state = state_code(r[10])
    sent = s(r[19])
    tz = None
    if sent and sent.lower() in by_name: tz = by_name[sent.lower()]['timezone']
    tz = tz or STATE_TZ.get(state or '', 'America/New_York')
    # appointment: date + time-of-day as shown in the sheet, in the lead's local time zone
    appt = None
    d = r[12]
    if isinstance(d, str):
        try: d = dt.datetime.fromisoformat(d)
        except ValueError: d = None
    if isinstance(d, (dt.datetime, dt.date)):
        t = r[13]
        if isinstance(t, dt.datetime): t = t.time()
        if isinstance(t, str):
            m = re.search(r'(\d{1,2}):(\d{2})', t); t = dt.time(int(m.group(1)), int(m.group(2))) if m else None
        if not isinstance(t, dt.time): t = dt.time(0, 0)
        day = d.date() if isinstance(d, dt.datetime) else d
        appt = dt.datetime.combine(day, t, ZoneInfo(tz)).astimezone(dt.timezone.utc).isoformat()
    sub = r[1] if isinstance(r[1], dt.datetime) else None
    submitted = sub.replace(tzinfo=ZoneInfo('Asia/Dhaka')).astimezone(dt.timezone.utc).isoformat() if sub else (appt or '2026-03-01T00:00:00+00:00')
    status = s(r[20]) or 'New – Needs QA'
    upd = r[29] if isinstance(r[29], dt.datetime) else None
    decided = None
    if status in ('Pass', 'Decline'):
        decided = (upd.replace(tzinfo=ZoneInfo('Asia/Dhaka')).astimezone(dt.timezone.utc).isoformat() if upd else appt or submitted)
    agent = s(r[2]); agent = alias.get((agent or '').lower(), agent)
    inv_date = r[26].date().isoformat() if isinstance(r[26], dt.datetime) else None
    if sent and sent.lower() not in by_name: missing_clients[sent] += 1
    extra = {k: v for k, v in {'billing_tier_sheet': s(r[15]), 'email_log_sheet': s(r[30])}.items() if v}
    leads.append(dict(code=s(r[0]), submitted_at=submitted, agent_name_raw=agent, company=s(r[3]) or '(no company name)',
        contact_name=s(r[4]), business_type=s(r[5]), phone=s(r[6]), email=s(r[7]), street=s(r[8]), city=s(r[9]),
        state=state, zip=s(r[11]), country='United States', appt_at=appt, appt_timezone=tz if appt else None,
        frequency=s(r[14]), facility_size=s(r[16]), current_type=s(r[17]), agent_notes=s(r[18]),
        _client=sent, status=status, client_feedback=s(r[21]), decided_at=decided,
        sent_at=(appt if sent else None), invoice_status=s(r[24]) or 'Not Invoiced', invoice_number=s(r[25]),
        invoiced_at=inv_date, paid_at=None, price=num(r[27]), source='Import: ' + (s(r[28]) or 'sheet'), extra=extra))

# clients that leads were sent to but are missing from the Clients tab (merge case differences)
seen = {}
for name, n in missing_clients.items():
    key = name.lower()
    if key in seen: continue
    c = dict(code=None, status='Paused', company=name, notes='Added by import: this name was in "Sent To" but not in the Clients tab. Check details or merge.',
             auto_send_leads=False)
    seen[key] = c; clients.append(c); by_name[key] = c

json.dump({'clients': clients, 'leads': leads}, open(out, 'w'), default=str)
print(f"clients {len(clients)} (from sheet {len(clients) - len(seen)}, added {len(seen)}: {sorted(c['company'] for c in seen.values())})")
print(f"leads {len(leads)}; re-aligned {shifted}; with appointment {sum(1 for l in leads if l['appt_at'])}")
print('status', dict(collections.Counter(l['status'] for l in leads)))
print('price set', sum(1 for l in leads if l['price']), 'total $', sum(l['price'] or 0 for l in leads if l['status'] == 'Pass'))
for code in ('LD-0001', 'LD-0149', 'LD-0599'):
    l = next(x for x in leads if x['code'] == code)
    print(code, {k: l[k] for k in ('company', 'phone', 'city', 'state', 'zip', 'appt_at', 'appt_timezone', 'frequency', 'current_type', 'facility_size', '_client', 'status')})
