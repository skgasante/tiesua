# Voice and Muse experiments

## Baseline, 2026-11-11

Version `5a031dd`. Code inspection found a configured 2,000 ms default quiet interval following a final recognition result, 300 ms post-playback guard, and a 35 s frontend API timeout. The backend waits for a complete Chat Completions response before validation and uses a 15 s HTTP timeout. It explicitly sends top-level `reasoning_effort`, default `minimal`, so omission of the parameter is not the source of high reasoning on this path. These are configured intervals, not measured acoustic or network latency.

No controlled baseline device recordings were available from prior evidence. The earlier acceptance tests used typed live turns and simulated voice events. The baseline suites passed 593 frontend tests and 251 backend tests.

## Reproducing the measurements

The pilot diagnostics and benchmark script described here are in the local voice worktree. Use that implementation to reproduce the branch results.

- Run `npm test` for the synthetic browser lifecycle and waveform tests. The existing virtual turn has 2,000 ms from a final browser result to dispatch and 300 ms from synthesis completion to reopening recognition. Both intervals remain unchanged. The new synthetic onset requires four 40 ms frames. This means 120 ms between the first and fourth positive samples, plus up to one sampling interval before the first sample. The test proves when cancellation is requested. Only a recording can establish when the actual speaker stops.
- Inspect `window.__tiesuaExportDiagnostics?.()` in a development build. Compare recognition completion, request, response ready, synthesis start and end, interruption recovery, echo discard and recognition errors. Browser callbacks approximate audio onset and end. Estimate median and p95 from repeated runs. Report denominator and missing callbacks. Diagnostic events omit transcripts.
- Run `.venv\Scripts\python.exe -m scripts.benchmark_muse` to list the synthetic schedule. The live command takes `--live --max-calls 16` and requires a server-side key. The fixed shuffled cases cover definitions, grouping, algebra and a wrong answer. Use the stated rubric to score mathematical correctness, lesson context and clarity. The script reports provider timings and usage where supplied. Use owner-configured per-million-token pricing to estimate cost. Samples below 20 per effort omit p95.
- On each device, run quiet playback, learner interruption, a slow response, several interruptions in succession and a device switch. Capture timing with separate consented test equipment and record numeric results only. Record speaker volume, audio route, browser, optional announcement mode and accessibility controls. Use synthetic speech for engineering checks. Test with a screen reader separately.

## Recognition alternatives

The existing browser adapter exposes partial transcripts and costs TieSua no separate transcription fee. The browser can use its own service, and recognition quality, latency and turn boundaries vary by device. Meta's Muse Voice Transcribe offers streaming partials, turn detection and vocabulary hints. It would require a secured audio transport. The listed price on 2026-11-11 was $0.18 per hour of processed audio. Whether it improves Ghanaian English or algebra transcription is unmeasured. It is not integrated. [Meta speech-to-text documentation](https://dev.meta.ai/docs/speech-to-text) and [Meta Model API pricing](https://dev.meta.ai/docs/pricing-rate-limits).

## Live Muse Spark Contributor benchmark, 2026-11-11

The owner approved synthetic paid calls. We ran 20. Four fixed questions exercised the production prompt, 800-token budget, 15-second upstream timeout and plan validator. No learner audio or identifying information was sent. First content is measured at the backend when a visible delta arrives. Complete time is backend time through response assembly. Neither metric includes browser synthesis or speaker hardware.

| Transport and effort | Usable plans | Median first content | Median complete | Reported reasoning tokens, usable plans |
| --- | --- | --- | --- | --- |
| Buffered minimal, baseline | 4 of 4 | Unavailable | 7.17 s | 958 |
| Streaming minimal | 4 of 4 | 6.90 s | 7.31 s | 681 |
| Streaming low | 2 of 4 | 9.80 s | 10.59 s | 1,148 |
| Streaming medium | 0 of 4 | Unavailable | Unavailable | Unavailable |
| Streaming high | 0 of 4 | Unavailable | Unavailable | Unavailable |

Two runs timed out. The other eight unavailable results raised JSON decoding errors. The small sample does not support p95 or a claim of faster model delivery. The valid minimal plans distinguished the two groupings, kept the final answer private when explaining the operation, and asked the learner to recheck the incorrect product. Across the ten usable plans, Meta reported 44,016 input tokens and 3,883 output tokens, including 2,787 reported reasoning tokens. Using the uncached input rate gives about $0.0052 for reported usage. Failed calls have unknown usage and any cache discount is excluded. The invoice remains authoritative. [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits).

Keep buffered `minimal` as the default. Standalone repeat and slower commands now bypass this latency altogether, and compound requests still reach Muse. `META_REASONING_EFFORT` can explicitly pin any tested level. If unset, `META_ADAPTIVE_REASONING=1` selects low for verified turns and medium when structured restrictions or an extraneous check are present. Leave adaptive effort and `META_ORCHESTRATE_STREAM` off for normal use while usable-plan rates are lower at higher effort.

References include [Meta reasoning](https://dev.meta.ai/docs/reasoning), [Meta streaming](https://dev.meta.ai/docs/cookbook/streaming-responses), [browser track settings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings) and [recognition audio track support](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start).
