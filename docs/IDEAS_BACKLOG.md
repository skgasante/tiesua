# Ideas backlog

| Date and source | Idea | Benefit | Dependency or challenge | Status |
| --- | --- | --- | --- | --- |
| 2026-11-11, owner | Integrate hands-free interruption with current lesson context | Natural follow-up questions | Physical echo tests and Web Speech startup | In progress |
| 2026-11-11, owner | Compare Muse Voice Transcribe to browser recognition | Potentially improved transcription and endpointing | Cost, child-data terms, Ghanaian English and maths test corpus | Under investigation |
| 2026-11-11, owner | Stream complete checked phrases | Shorter wait before playback | Whole-plan validation, provider cancellation and transport tests | Under investigation |
| 2026-11-11, engineering audit | Measure speaker echo before adding acoustic processing | Avoid unnecessary dependencies and regressions | Device, voice and output-route measurements | Proposed |
| 2026-11-11, live benchmark | Compare a shorter, context-specific tutoring prompt with the current prompt | Reduce prompt tokens and possibly time to content | Preserve handling for corrections, compound requests, grouping, and accessibility. Score on a larger corpus. | Proposed |

## Alternatives and their disposition

| Alternative | Status | Reason and what would change the decision |
| --- | --- | --- |
| Flat reading of an expression | Retained as a comparison | Useful for demonstrating ambiguity. The teaching voice uses the expression structure to preserve scope. See [ADR-001](DECISIONS/001-voice-and-verification.md). |
| Phrase matching as the main conversational engine | Superseded | A phrase list cannot reliably capture paraphrases, compound requests and context. Keep deterministic checks and narrow controls, with Muse interpreting ordinary learner turns. See [project history](PROJECT_HISTORY.md). |
| Loudspeaker interruption based on volume | Experimental only | Sustained audio can be the tutor's own voice. A supported rollout needs physical evidence across output devices. See [ADR-003](DECISIONS/003-interruption-pilot.md). |
| Paid streaming transcription | Deferred | The browser remains the default. Compare recognition of Ghanaian English and grouped mathematics, endpointing, cost and child-data handling before making an integration decision. See [experiments](EXPERIMENTS.md). |
| Speaking partial model text immediately | Deferred | Partial output can precede the verdict and action validation. Revisit with a protocol that validates complete mathematical phrases before playback. |
| Higher reasoning as a universal default | Rejected for the current request shape | In the small trial, higher effort produced fewer usable plans. Reconsider with a larger test corpus and a response budget that measures both completion and teaching quality. |
| VPS and Cloudflare deployment | Historical package | The chosen deployment uses Vercel and shared state. The existence of a VPS package is evidence of preparation only. See [ADR-004](DECISIONS/004-shared-deployment-state.md). |
