# ADR-004. Shared verification state and model usage controls

Recorded 2026-11-13. Status implemented in the hosting configuration and application. The exact decision date is unknown. The implementation is recorded in local commit `fe2dc75` dated 2026-11-03.

## Problem and options

The verification engine needs the original problem, working equation and pending operation across turns. Process memory is suitable for isolated local development. In a serverless deployment, a different worker can handle the next request. A purely client-held state design would require a separate integrity and concurrency mechanism. That option is an engineering comparison for this record. The historical notes do not establish that it was formally considered.

## Decision and consequences

The hosted configuration uses two Vercel projects and server-side shared Redis. It keeps verification state available across workers and supports shared request deduplication and usage controls. Model credentials belong to the backend environment. The browser sends a request ID and consumes verified state or a validated teaching plan.

This design preserves the authority of the verifier and helps prevent duplicate billable calls. It adds a shared storage dependency and network calls. Availability and recovery must be tested when changing deployments. A teaching failure should keep the learner's place and make the available recovery action clear.

See the [request protection](../../backend/app/public_requests.py), [shared store](../../backend/app/shared_store.py), [verification API](../../backend/app/main.py), [backend deployment configuration](../../backend/vercel.json) and [architecture](../ARCHITECTURE.md).
