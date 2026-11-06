"""Day shift (Australia) sheet -> clean JSON. Result comes from the company cell colour (legend from management)."""
import json, re, sys, datetime as dt, collections, os
from zoneinfo import ZoneInfo
import openpyxl
sys.path.insert(0, os.path.dirname(__file__))
from colors import theme_palette, cell_rgb, bucket

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src); pal = theme_palette(wb)
STATE_TZ = {'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney', 'VIC': 'Australia/Melbourne', 'QLD': 'Australia/Brisbane',
            'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth', 'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin'}
UNSENT = {'Form Response', 'Extra Leads'}
title = lambda ws: ws.title.strip()

def s(v):
    if v is None: return None
    if isinstance(v, float) and v.is_integer(): v = int(v)
    t = re.sub(r'\s+', ' ', str(v)).strip().strip(',').strip()
    return None if t.lower() in ('', 'n/a', 'na', 'none', '-') else t

def phone(v):
    t = s(v)
    if t and re.fullmatch(r'61\d{8,9}', t): t = '+' + t
    return t

clients = [dict(company=title(ws), status='Active', industry='Commercial cleaning / Janitorial',
                notes='Added by import from the day shift sheet (tab name). Fill in contact, email and price.',
                auto_send_leads=False) for ws in wb if title(ws) not in UNSENT]
leads, stats = [], collections.Counter()
for ws in wb:
    for row in ws.iter_rows(min_row=2):
        v = [c.value for c in row[:16]]
        if not (s(v[1]) and s(v[3])): continue
        color = bucket(cell_rgb(row[3], pal))
        sent = title(ws) not in UNSENT
        state = (s(v[7]) or '').upper()
        tz = STATE_TZ.get(state, 'Australia/Sydney')
        appt = None
        if isinstance(v[10], dt.datetime):
            t = v[11] if isinstance(v[11], dt.time) else (v[11].time() if isinstance(v[11], dt.datetime) else dt.time(0, 0))
            appt = dt.datetime.combine(v[10].date(), t, ZoneInfo(tz)).astimezone(dt.timezone.utc).isoformat()
        submitted = (v[0].replace(tzinfo=ZoneInfo('Asia/Dhaka')).astimezone(dt.timezone.utc).isoformat() if isinstance(v[0], dt.datetime)
                     else appt or '2026-05-01T00:00:00+00:00')
        status, feedback = {
            'red': ('Decline', None), 'green': ('Pass', None), 'yellow': ('Rebook – Needs New Date', None),
            'orange': ('Sent to Client', 'No feedback from client yet (orange in old sheet)'),
        }.get(color, (None, None))
        if status is None:
            status = 'Sent to Client' if sent else ('New – Needs QA' if title(ws) == 'Form Response' else 'Need to Sell')
        if not sent and status in ('Sent to Client', 'Rebook – Needs New Date'): status = 'Need to Sell'
        stats[(ws.title if sent else ws.title, status)] += 1
        leads.append(dict(submitted_at=submitted, agent_name_raw=s(v[1]), contact_name=s(v[2]), company=s(v[3]),
            business_type=s(v[4]), street=s(v[5]), city=s(v[6]), state=state or None, zip=s(v[8]), email=s(v[9]),
            appt_at=appt, appt_timezone=tz if appt else None, frequency=s(v[12]), facility_size=s(v[13]),
            agent_notes=s(v[14]), phone=phone(v[15]), country='Australia',
            _client=title(ws) if sent else None, status=status, client_feedback=feedback,
            decided_at=(appt or submitted) if status in ('Pass', 'Decline') else None,
            sent_at=(appt or submitted) if sent else None, source=f'Import: day sheet › {title(ws)}',
            extra={'sheet_color': color}))
leads.sort(key=lambda l: l['submitted_at'])
json.dump({'clients': clients, 'leads': leads}, open(out, 'w'), default=str)
tot = collections.Counter(l['status'] for l in leads)
print('clients', len(clients), [c['company'] for c in clients]); print('leads', len(leads), dict(tot))
now = dt.datetime.now(dt.timezone.utc).isoformat()
print('waiting with appointment already past:', sum(1 for l in leads if l['status'] == 'Sent to Client' and l['appt_at'] and l['appt_at'] < now))
for t in ('RVG', 'D2D', 'ACC'):
    print(t, {k[1]: n for k, n in stats.items() if k[0] == t})
l = leads[-1]; print({k: l[k] for k in ('company', 'phone', 'city', 'state', 'zip', 'appt_at', 'appt_timezone', 'status', '_client')})
