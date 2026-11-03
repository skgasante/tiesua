"""Serverless persistence through Upstash's HTTPS Redis API. No local fallback on Vercel."""
from __future__ import annotations

import os
import re
from contextvars import ContextVar

request_reservations: ContextVar[list[int] | None] = ContextVar("request_reservations", default=None)

import httpx


class StoreUnavailable(Exception):
    pass


def enabled() -> bool:
    return bool(os.getenv("VERCEL") or os.getenv("UPSTASH_REDIS_REST_URL"))


def key(suffix: str) -> str:
    namespace = os.getenv("TIESUA_STORE_NAMESPACE", "tiesua")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,60}", namespace):
        raise StoreUnavailable("Invalid storage namespace")
    return f"{namespace}:{suffix}"


def command(*parts):
    url = os.getenv("UPSTASH_REDIS_REST_URL", "")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
    if not url.startswith("https://") or not token:
        raise StoreUnavailable("Shared storage is not configured")
    try:
        response = httpx.post(url.rstrip("/"), headers={"Authorization": f"Bearer {token}"},
                              json=list(parts), timeout=4.0)
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise StoreUnavailable("Shared storage rejected the request")
        return payload["result"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise StoreUnavailable("Shared storage is unavailable") from exc


RATE_SCRIPT = """
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return n <= tonumber(ARGV[1]) and 1 or 0
"""


def rate_allowed(identity: str, limit: int, seconds: int = 60) -> bool:
    return command("EVAL", RATE_SCRIPT, 1, key("rate:" + identity), limit, seconds) == 1


BUDGET_SCRIPT = """
local calls = tonumber(redis.call('HGET', KEYS[1], 'calls') or '0')
local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens') or '0')
if tonumber(ARGV[2]) > 0 and calls >= tonumber(ARGV[2]) then return 0 end
if tonumber(ARGV[3]) > 0 and tokens + tonumber(ARGV[1]) > tonumber(ARGV[3]) then return 0 end
redis.call('HINCRBY', KEYS[1], 'calls', 1)
redis.call('HINCRBY', KEYS[1], 'tokens', ARGV[1])
return 1
"""


def reserve(tokens: int) -> bool:
    # Optional lifetime ceilings. Zero/unset explicitly means no application ceiling.
    # Never read local DEV_MAX_CALLS or UNLIMITED_CALLS in the deployed path.
    ledger = request_reservations.get()
    if ledger is not None and ledger[0] >= 1:
        return False
    try:
        accepted = command("EVAL", BUDGET_SCRIPT, 1, key("budget"), tokens,
                       int(os.getenv("TIESUA_PUBLIC_MAX_CALLS", "0")),
                       int(os.getenv("TIESUA_PUBLIC_MAX_OUTPUT_TOKENS", "0"))) == 1
        if accepted and ledger is not None:
            ledger[0] += 1
        return accepted
    except (StoreUnavailable, ValueError):
        return False  # cannot spend when the shared protection is unavailable


def budget_status() -> dict:
    try:
        data = command("HGETALL", key("budget")) or []
        values = dict(zip(data[::2], data[1::2]))
        return {"calls_used": int(values.get("calls", 0)),
                "tokens_reserved": int(values.get("tokens", 0)), "scope": "deployment-lifetime",
                "max_calls": int(os.getenv("TIESUA_PUBLIC_MAX_CALLS", "0")),
                "max_output_tokens": int(os.getenv("TIESUA_PUBLIC_MAX_OUTPUT_TOKENS", "0"))}
    except (StoreUnavailable, ValueError):
        return {"available": False, "live_calls_blocked": True}
