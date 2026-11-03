"""Shared request deduplication. Request IDs are random, never derived from speech."""
import hashlib
import re

from fastapi.responses import Response, JSONResponse
from starlette.concurrency import run_in_threadpool

from . import shared_store as store

PAID = {"/v1/orchestrate", "/v1/interpret", "/v1/tutor/lesson"}


async def protect(request, call_next):
    token = store.request_reservations.set([0])
    try:
        return await _protect(request, call_next)
    finally:
        store.request_reservations.reset(token)


async def _protect(request, call_next):
    if not store.enabled() or request.method != "POST":
        return await call_next(request)
    path = request.url.path
    if path not in PAID and not path.endswith("/tutor"):
        return await call_next(request)
    request_id = request.headers.get("x-tiesua-request-id", "")
    if not re.fullmatch(r"[a-fA-F0-9-]{32,36}", request_id):
        return JSONResponse(status_code=400, content={"detail": "Please reload the app before trying again."})
    body = await request.body()
    if len(body) > 16384:
        return JSONResponse(status_code=413, content={"detail": "Request too large."})
    # Same ID with changed content is a conflict, never a second paid call.
    digest = hashlib.sha256(path.encode() + body).hexdigest()
    cache_key = store.key("request:" + request_id)
    try:
        acquired = await run_in_threadpool(store.command, "SET", cache_key, "pending:" + digest, "NX", "EX", 120)
        if acquired != "OK":
            saved = await run_in_threadpool(store.command, "GET", cache_key)
            import json
            if saved and saved.startswith("done:"):
                result = json.loads(saved[5:])
                if result["digest"] == digest:
                    return Response(result["body"], status_code=result["status"], media_type="application/json")
            return JSONResponse(status_code=409, content={"detail": "That response is still being checked. Please wait a moment."})
        response = await call_next(request)
        raw = b"".join([part async for part in response.body_iterator])
        import json
        result = json.dumps({"digest": digest, "status": response.status_code, "body": raw.decode()})
        await run_in_threadpool(store.command, "SET", cache_key, "done:" + result, "EX", 120)
        return Response(raw, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)
    except store.StoreUnavailable:
        return JSONResponse(status_code=503, content={"detail": "The teaching service is unavailable just now. Your place is kept."}, headers={"Retry-After": "5"})
