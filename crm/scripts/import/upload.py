"""Uploads import JSON through the normal API as an owner (so every database rule still applies)."""
import json, ssl, sys, urllib.request
URL = 'https://cuprsqgastbhbwqzznes.supabase.co'
KEY = 'sb_publishable_d1GRz8vPjknCJpor1yfPNQ_mc59himt'
ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
data_file, pw_file, shift_name = sys.argv[1], sys.argv[2], sys.argv[3]

def call(method, path, body=None, token=None, prefer=None):
    h = {'apikey': KEY, 'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    if prefer: h['Prefer'] = prefer
    req = urllib.request.Request(URL + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, context=ctx) as r:
            t = r.read().decode(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} -> {e.code} {e.read().decode()[:400]}')

tok = call('POST', '/auth/v1/token?grant_type=password', {'email': sys.argv[4] if len(sys.argv) > 4 else 'owner@example.com', 'password': open(pw_file).read().strip()})['access_token']
shift = call('GET', f'/rest/v1/shifts?select=id&name=eq.{urllib.parse.quote(shift_name)}', token=tok)[0]['id']
d = json.load(open(data_file))

# clients
keys = sorted({k for c in d['clients'] for k in c})
rows = [{k: c.get(k) for k in keys} | {'shift_id': shift} for c in d['clients']]
for r in rows:
    if r.get('code') is None: r.pop('code', None)
made = []
for grp in (lambda rs: [[r for r in rs if 'code' in r], [r for r in rs if 'code' not in r]])(rows):
    if grp: made += call('POST', '/rest/v1/clients?select=id,company', grp, tok, 'return=representation,missing=default')
ids = {m['company'].lower(): m['id'] for m in made}
print('clients inserted', len(made))

# leads in batches
done = 0
for i in range(0, len(d['leads']), 200):
    batch = []
    for l in d['leads'][i:i + 200]:
        l = dict(l); name = l.pop('_client')
        l['client_id'] = ids.get(name.lower()) if name else None
        l['shift_id'] = shift
        batch.append(l)
    call('POST', '/rest/v1/leads', batch, tok, 'return=minimal,missing=default')
    done += len(batch)
print('leads inserted', done)
