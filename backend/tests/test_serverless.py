"""Real Redis command/Lua semantics in fakeredis; all Meta calls prohibited."""
import concurrent.futures
import json
import uuid

import fakeredis
import pytest
from fastapi.testclient import TestClient

from backend.app import shared_store as store, verifier, session_storage, tutor, main


@pytest.fixture
def redis(monkeypatch):
    database = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TIESUA_DISABLE_LIVE_AI", "1")
    def wire_command(*args):
        value = database.execute_command(*args)
        if args[0] == "SET" and value is True:
            return "OK"
        if isinstance(value, dict):
            return [item for pair in value.items() for item in pair]
        return value
    monkeypatch.setattr(store, "command", wire_command)
    return database


def test_full_verified_journey_survives_cold_instances_and_undo(redis):
    client = TestClient(main.app)
    sid = client.post('/v1/sessions', json={'problem': '(x+2)/4 = 3'}).json()['session_id']
    other = client.post('/v1/sessions', json={'problem': '(x+3)/5 = 4'}).json()['session_id']
    for text, solved in [('multiply both sides by 4', False), ('x+2=12', False), ('subtract 2 from both sides', False), ('x=10', True)]:
        verifier._SESSIONS.clear()  # simulate losing every process-local object
        result = client.post(f'/v1/sessions/{sid}/step', json={'input': text})
        assert result.status_code == 200, result.text
        assert result.json()['state']['solved'] == solved
        assert client.get(f'/v1/sessions/{other}').json()['state']['step_index'] == 0
    assert client.post(f'/v1/sessions/{sid}/undo').json()['state']['solved'] is False
    assert client.get(f'/v1/sessions/{sid}').json()['state']['equation_text'] == 'x + 2 = 12'


def test_false_arithmetic_never_corrupts_shared_equation(redis):
    client = TestClient(main.app)
    sid = client.post('/v1/sessions', json={'problem': '(x+2)/4=3'}).json()['session_id']
    for text in ['12=13', '12=12', 'three times four makes thirteen']:
        result = client.post(f'/v1/sessions/{sid}/step', json={'input': text})
        assert result.json()['state']['step_index'] == 0
        assert 'x' in result.json()['state']['equation_text']


def test_concurrent_mutations_are_rejected_not_overwritten(redis):
    sid, _ = verifier.create_session('(x+2)/4=3')
    with session_storage.transaction(sid):
        with pytest.raises(session_storage.SessionConflict):
            with session_storage.transaction(sid):
                pass
    assert not redis.exists(store.key('session-lock:' + sid))


def test_expired_lock_owner_cannot_commit_or_delete_new_lock(redis):
    sid, _ = verifier.create_session('(x+2)/4=3')
    with pytest.raises(session_storage.SessionConflict):
        with session_storage.transaction(sid) as session:
            session.solved = True
            redis.set(store.key('session-lock:' + sid), 'new-owner')
    assert redis.get(store.key('session-lock:' + sid)) == 'new-owner'
    assert not verifier.get_session(sid).solved


def test_public_budget_ignores_development_caps_and_has_no_turn_limit(redis, monkeypatch):
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    monkeypatch.setenv('TIESUA_DEV_MAX_CALLS', '1')
    monkeypatch.setenv('TIESUA_BUDGET_MAX_CALLS', '1')
    for _ in range(100):
        assert tutor.MetaBudget().reserve(800)  # new instances share counters
    assert store.budget_status()['calls_used'] == 100


def test_explicit_owner_ceiling_is_atomic_across_instances(redis, monkeypatch):
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    monkeypatch.setenv('TIESUA_PUBLIC_MAX_CALLS', '17')
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: tutor.MetaBudget().reserve(800), range(100)))
    assert sum(results) == 17
    assert store.budget_status()['calls_used'] == 17


def test_storage_failure_blocks_spending_and_state_fails_accessibly(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI', raising=False)
    def fail(*args):
        raise store.StoreUnavailable()
    monkeypatch.setattr(store, 'command', fail)
    assert tutor.MetaBudget().reserve(800) is False
    response = TestClient(main.app).post('/v1/sessions', json={'problem': 'x=10'})
    assert response.status_code == 503
    assert 'try again' in response.json()['detail']


def test_duplicate_request_reuses_result_without_another_orchestrator_call(redis, monkeypatch):
    calls = []
    def respond(text, context):
        calls.append(text)
        return {'source': 'mock', 'reply': 'What does equally mean?', 'actions': []}
    monkeypatch.setattr(main, 'orchestrate_request', respond)
    client = TestClient(main.app)
    headers = {'X-TieSua-Request-ID': uuid.uuid4().hex}
    first = client.post('/v1/orchestrate', headers=headers, json={'text': 'help please'})
    second = client.post('/v1/orchestrate', headers=headers, json={'text': 'help please'})
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert calls == ['help please']
    assert client.post('/v1/orchestrate', headers=headers, json={'text': 'changed'}).status_code == 409


def test_public_requests_require_request_ids(redis):
    assert TestClient(main.app).post('/v1/orchestrate', json={'text': 'hello'}).status_code == 400


def test_shared_rate_limit_and_private_usage(redis, monkeypatch):
    from backend.app.usage import record, status
    assert store.rate_allowed('test-learner', 2)
    assert store.rate_allowed('test-learner', 2)
    assert not store.rate_allowed('test-learner', 2)
    record({'usage': {'prompt_tokens': 1000, 'completion_tokens': 500}})
    monkeypatch.setenv('META_INPUT_USD_PER_MILLION', '1')
    monkeypatch.setenv('META_OUTPUT_USD_PER_MILLION', '2')
    assert status()['estimated_usd'] == .002
    assert 'usage' not in TestClient(main.app).get('/v1/diagnostics').json()


def test_json_symbolic_round_trip_including_undo(redis):
    sid, session = verifier.create_session('(x+2)/4=3')
    verifier.submit_step(session, 'x+2=12')
    session_storage.save(sid, session)
    recovered = verifier.get_session(sid)
    assert verifier.state_payload(recovered) == verifier.state_payload(session)
    assert verifier.undo_last_step(recovered)['state']['step_index'] == 0


def test_unknown_symbolic_constructor_is_never_evaluated():
    with pytest.raises(KeyError):
        session_storage.decode({'$math': '__import__', 'args': ['os']})


def test_one_paid_reservation_per_request_does_not_limit_later_turns(redis, monkeypatch):
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    for _ in range(10):
        token = store.request_reservations.set([0])
        try:
            assert store.reserve(800)
            assert not store.reserve(800)
        finally:
            store.request_reservations.reset(token)
    assert store.budget_status()['calls_used'] == 10


def test_production_never_spends_on_an_accidentally_configured_other_model(redis, monkeypatch):
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    monkeypatch.setenv('META_MODEL', 'muse-spark-1.3')
    assert not tutor.MetaBudget().reserve(800)


def test_rest_storage_uses_secret_header_not_url(monkeypatch):
    monkeypatch.setenv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test')
    monkeypatch.setenv('UPSTASH_REDIS_REST_TOKEN', 'test-secret')
    observed = []
    class Result:
        def raise_for_status(self): pass
        def json(self): return {'result': 'OK'}
    def post(url, **kwargs):
        observed.append((url, kwargs))
        return Result()
    monkeypatch.setattr(store.httpx, 'post', post)
    assert store.command('SET', 'example', 'value', 'EX', 60) == 'OK'
    assert observed[0][0] == 'https://redis.example.test'
    assert observed[0][1]['headers']['Authorization'] == 'Bearer test-secret'
    assert observed[0][1]['json'] == ['SET', 'example', 'value', 'EX', 60]
    assert observed[0][1]['timeout'] == 4.0


def test_rest_storage_errors_do_not_expose_credentials(monkeypatch):
    monkeypatch.setenv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test')
    monkeypatch.setenv('UPSTASH_REDIS_REST_TOKEN', 'test-secret')
    class Result:
        def raise_for_status(self): pass
        def json(self): return {'error': 'provider returned test-secret'}
    monkeypatch.setattr(store.httpx, 'post', lambda *a, **k: Result())
    with pytest.raises(store.StoreUnavailable) as exc:
        store.command('GET', 'example')
    assert 'test-secret' not in str(exc.value)


@pytest.mark.parametrize('status', [401, 402, 429, 500, 503])
def test_provider_failure_preserves_work_and_returns_honest_recovery(redis, monkeypatch, status):
    import httpx
    from backend.app import orchestrator
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    monkeypatch.setenv('MODEL_API_KEY', 'test-dummy')
    monkeypatch.setenv('META_MODEL', 'muse-spark-1.3-contributor')
    response = httpx.Response(status, request=httpx.Request('POST', 'https://meta.example.test'))
    monkeypatch.setattr(orchestrator.httpx, 'post', lambda *a, **k: response)
    client = TestClient(main.app)
    sid = client.post('/v1/sessions', json={'problem': '(x+2)/4=3'}).json()['session_id']
    before = client.get(f'/v1/sessions/{sid}').json()
    result = client.post('/v1/orchestrate', headers={'X-TieSua-Request-ID': uuid.uuid4().hex},
                         json={'text': 'please explain', 'context': {}})
    assert result.status_code == 200
    assert result.json()['source'] != 'live-meta'
    assert result.json().get('clarification') or result.json().get('reply')
    assert client.get(f'/v1/sessions/{sid}').json() == before
