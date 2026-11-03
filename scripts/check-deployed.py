"""Deterministic deployment smoke test. Never invokes Meta or reads any API key.

Usage: python scripts/check-deployed.py https://BACKEND.vercel.app --origin https://FRONTEND.vercel.app
"""
import argparse
import json
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('backend')
parser.add_argument('--origin', required=True)
args = parser.parse_args()
base = args.backend.rstrip('/')
if not base.startswith('https://'):
    parser.error('Use the deployed HTTPS backend URL.')


def request(path, body=None, method=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(base + path, data=data, method=method,
                  headers={'Content-Type': 'application/json', 'Origin': args.origin, **(headers or {})})
    with urlopen(req, timeout=35) as response:
        assert response.headers.get('Access-Control-Allow-Origin') == args.origin
        return json.load(response)


assert request('/health')['status'] == 'ok'
ready = request('/ready')
assert ready['storage'] == 'shared'
assert ready['model'] == 'muse-spark-1.3-contributor'
first = request('/v1/sessions', {'problem': '(x+2)/4=3'})['session_id']
second = request('/v1/sessions', {'problem': '(x+3)/5=4'})['session_id']
for value in ['12=13', '12=12']:
    state = request(f'/v1/sessions/{first}/step', {'input': value})['state']
    assert state['step_index'] == 0 and 'x' in state['equation_text']
for value in ['multiply both sides by 4', 'x+2=12', 'subtract 2 from both sides', 'x=10']:
    result = request(f'/v1/sessions/{first}/step', {'input': value})
    assert result['verdict'] == 'valid', result
assert request(f'/v1/sessions/{first}')['state']['solved']
assert request(f'/v1/sessions/{second}')['state']['step_index'] == 0
assert not request(f'/v1/sessions/{first}/undo', method='POST')['state']['solved']
print('PASS: HTTPS routes, readiness, CORS, two independent learners, arithmetic safety, x=10 and undo. Zero Meta calls.')
