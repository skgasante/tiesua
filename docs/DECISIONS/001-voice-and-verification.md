# ADR-001 Voice-first access, grouped speech and independent verification

Recorded 2026-11-11. Historical decision dates are only known through the October 2026 source and commits. Status implemented.

Blind and low-vision learners need unambiguous spoken notation and mathematically sound step feedback. The project implemented structured speech rather than flat text reading, and deterministic verification rather than relying on model judgement. The Ordinary speech mode provides a comparison for flat reading. Recorded alternatives are limited to what the source shows. The approach adds parser and speech-plan maintenance but supports testable grouping and reliable checks. See [history](../PROJECT_HISTORY.md) and [mathematics engine](../MATHEMATICS_ENGINE.md).
