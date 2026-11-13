# Known issues

- **VOICE-01** Browser speech synthesis may leak into the microphone. The historical lab detects sustained sound and has no reference waveform for comparing microphone input with playback. Device-specific measurements remain necessary.
- **VOICE-02** In the pilot, local detection can cancel playback. Transcription starts after the speaker tail and browser recognition startup, so a short interruption may be clipped or lost. Browser endpointing can also shorten a slow learner's turn. Headphones, laptop and mobile speakers and NVDA need physical acceptance.
- **PERF-01** The two-second default recognition quiet timer, upstream generation and full JSON buffering can all contribute to delay. Their relative impact requires measured audio and live API timings.
- **MATH-01** A combined spoken operation and final answer can require repeating the final equation as a separate turn. The original verification path must still reject incorrect results.
- **PRIVACY-01** Contributor mode may use eligible content for training. Review applicable eligibility, terms, consent, age and retention with the owner before identifiable learner traffic. Development uses synthetic examples.
- **PERF-02** The upstream stream assembles a validated plan before the response reaches React. The production deduplication middleware buffers complete responses. Cancelling the browser fetch prevents obsolete delivery but can leave an upstream request in flight.
