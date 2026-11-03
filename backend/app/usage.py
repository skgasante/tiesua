"""Aggregate provider-reported usage, without storing learner speech or secrets."""
import os
from . import shared_store as store


def record(payload):
    if not store.enabled():
        return
    usage = payload.get("usage", {})
    if not usage:
        return
    try:
        prompt = max(0, int(usage.get("prompt_tokens", 0)))
        completion = max(0, int(usage.get("completion_tokens", 0)))
    except (TypeError, ValueError):
        return
    try:
        store.command("EVAL", "redis.call('HINCRBY', KEYS[1], 'input', ARGV[1]); redis.call('HINCRBY', KEYS[1], 'output', ARGV[2]); return 1",
                      1, store.key("usage"), prompt, completion)
    except store.StoreUnavailable:
        pass  # telemetry failure must not discard a legitimate teaching response


def status():
    raw = store.command("HGETALL", store.key("usage")) or []
    usage = dict(zip(raw[::2], raw[1::2]))
    prompt, completion = int(usage.get("input", 0)), int(usage.get("output", 0))
    input_price, output_price = os.getenv("META_INPUT_USD_PER_MILLION"), os.getenv("META_OUTPUT_USD_PER_MILLION")
    estimate = (prompt * float(input_price) + completion * float(output_price)) / 1_000_000 if input_price and output_price else None
    return {"reported_input_tokens": prompt, "reported_output_tokens": completion,
            "estimated_usd": estimate, "pricing_source": "owner-configured" if estimate is not None else "not configured",
            "note": "Provider invoices remain authoritative. Missing usage and reasoning charges may affect this estimate."}
