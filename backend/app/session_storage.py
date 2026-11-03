"""JSON-only verified-state storage; symbolic nodes use a closed constructor list."""
from contextlib import contextmanager
from dataclasses import fields
import json
import threading
import uuid

import sympy as sp

from . import shared_store as store

_local_lock = threading.RLock()
TTL = 30 * 24 * 60 * 60


def encode(value):
    if isinstance(value, sp.Integer):
        return {"$math": "Integer", "args": [str(value)]}
    if isinstance(value, sp.Rational):
        return {"$math": "Rational", "args": [str(value.p), str(value.q)]}
    if isinstance(value, sp.Symbol):
        return {"$math": "Symbol", "args": [str(value)]}
    if isinstance(value, sp.Basic):
        if value.func not in (sp.Eq, sp.Add, sp.Mul, sp.Pow):
            raise store.StoreUnavailable("Unsupported symbolic state")
        return {"$math": value.func.__name__, "args": [encode(a) for a in value.args]}
    if isinstance(value, dict):
        return {k: encode(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode(v) for v in value]
    return value


def decode(value):
    if isinstance(value, dict) and "$math" in value:
        constructors = {"Integer": sp.Integer, "Rational": sp.Rational, "Symbol": sp.Symbol,
                        "Equality": lambda *a: sp.Eq(*a, evaluate=False),
                        "Add": lambda *a: sp.Add(*a, evaluate=False),
                        "Mul": lambda *a: sp.Mul(*a, evaluate=False),
                        "Pow": lambda *a: sp.Pow(*a, evaluate=False)}
        return constructors[value["$math"]](*[decode(a) for a in value["args"]])
    if isinstance(value, dict):
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


def dumps(session):
    return json.dumps(encode({f.name: getattr(session, f.name) for f in fields(session)}))


def load(sid):
    from .verifier import Session
    if len(sid) != 32 or any(c not in "0123456789abcdef" for c in sid):
        return None
    raw = store.command("GET", store.key("session:" + sid))
    return Session(**decode(json.loads(raw))) if raw else None


def save(sid, session):
    store.command("SET", store.key("session:" + sid), dumps(session), "EX", TTL)


COMMIT = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('DEL', KEYS[1])
return 1
"""
UNLOCK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0"


class SessionConflict(Exception):
    pass


@contextmanager
def transaction(sid):
    from .verifier import get_session
    if not store.enabled():
        with _local_lock:
            yield get_session(sid)
        return
    lock_key = store.key("session-lock:" + sid)
    token = uuid.uuid4().hex
    if store.command("SET", lock_key, token, "NX", "EX", 30) != "OK":
        raise SessionConflict()
    try:
        session = get_session(sid)
        yield session
        if session is not None and store.command("EVAL", COMMIT, 2, lock_key,
                store.key("session:" + sid), token, dumps(session), TTL) != 1:
            raise SessionConflict()
    finally:
        store.command("EVAL", UNLOCK, 1, lock_key, token)
