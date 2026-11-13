# Development history

Recorded 2026-11-11. Dates below come from local Git author dates. Historical hashes refer to the original local lineage where indicated. A commit shows the documented intent and source change, not proof of physical-device success.

| Date | Milestone | Repository evidence |
| --- | --- | --- |
| 2026-10-26 | Expression parser, abstract syntax tree and Natural, Detailed and Ordinary speech modes. App shell and Hear the Difference followed. | `b8bad04`, local `6b4389c` |
| 2026-10-26 | FastAPI/SymPy verifier and live tutoring with fallback. Domain restrictions, partial solution sets and extraneous answers became explicit. | Local `8f97543`, `d478406`, `d05dd82`, `9f3e6d6` |
| 2026-10-26 | Ghana JHS problems, spoken answers, phrase-level synthesis, 2.5× speech cap, budget controls and accessibility test protocol. | Local `2b8833b`, `b34531a`, `ba5f012`, `dd417cf`, `25b6a9a` |
| 2026-10-27 | Catalogue, lesson stages and central Meta action proposals. Interruption lab used sustained audio level and remained experimental. | Local `cd9dce3`, `aa7c4d9`, `2002078` |
| 2026-10-27 | The Mathematical Stage visual direction was integrated, followed by a teacher-first minimal prototype and integration into Home, Lessons and the lesson runner. | Local `ce8a0f2`, `aedae62`, `d832087` |
| 2026-10-28 | One conversation session across screens. Production capture suspended during synthesis to prevent observed self-transcription. Numeric equalities cannot overwrite algebra state. | Local `4c9104b`, `849ead9`, `1ebee92` |
| 2026-10-30 to 2026-11-03 | Lesson progression, navigation/resume, recovery, and playback handoff improved. Vercel frontend/backend and shared Redis session support added. An isolated VPS package existed earlier. | Local `e703ea5`, `04e11f8`, `ed181d2`, `740cd6a`, `fe2dc75`, `77204f1` |
| Public history | Clean source snapshot removed private project records. Explore honors pause preferences. Practice preserves verified feedback and understands polite requests. Default speech rate became 0.8×. | `536023c`, `47f1863`, `9295943` (PR #1), `0b7405b`, `5a031dd` |

## Evidence and gaps

The 2026-11-13 review checked the local branches, the November 1 backup tag, the rewritten public branch, and the available repository issues and pull requests. The accessible issue list was empty and [PR #1](https://github.com/skgasante/tiesua/pull/1) was merged. Historical architecture, lesson authoring, speech diagnosis, mock acceptance and human accessibility notes survive on the original local lineage. This account summarizes their engineering findings without republishing those files. The [experiment record](EXPERIMENTS.md) documents the later live benchmark separately from the deployed baseline.

Original design deliberations, unpublished issue discussions and complete physical-device recordings were unavailable as verified public evidence. Recover those only with owner-provided records and privacy review. Commit titles and local notes document experiments and intent. No learner outcomes can be inferred from them.

## Why the design changed

| Period | Earlier approach and observed problem | Change and rationale | Evidence |
| --- | --- | --- | --- |
| Oct 26 | Flat spoken notation could leave the scope of a fraction unclear. | Parse expressions into a tree, then use that structure to speak and pause at the right boundaries. Keep Ordinary mode as a comparison. | Public `b8bad04`, local `ba5f012`, [ADR-001](DECISIONS/001-voice-and-verification.md) |
| Oct 26 | Checking only a candidate equation or final value missed domain restrictions and incomplete sets of solutions. | Make the verifier distinguish equivalent, partial, complete and extraneous results. Verify against the original equation where required. | Local `d05dd82`, `9f3e6d6` |
| Oct 26–28 | Early deterministic intent handling had trouble with varied phrasing and context. Letting the model drive every state change would also let an invalid plan override lesson or math state. | Make Meta the principal interpreter. Apply its proposals through action and progression checks and keep independent verification. | Local `45b39e8`, `aa7c4d9`, `387079f`, `1ebee92` |
| Oct 27–28 | The interruption lab used sustained audio level. Playback could be heard as learner speech, and different screens needed consistent turn-taking. | Use one global conversation and suspend recognition during tutor playback. Keep the experiment separate from the supported controls. | Local `2002078`, `4c9104b`, `849ead9`, [ADR-003](DECISIONS/003-interruption-pilot.md) |
| Oct 28–Nov 2 | A transition could skip the operation, offer choices too early, or resume without restoring the question. | Use separate teaching steps, guard progression and restore the learner's task after a detour. Connect equation narration to the speech conventions and let audio events drive the status. | Local `d98b6ce`, `77b0855`, `04e11f8`, `477a23a`, `854e7c3`, `8b7042e` |
| Nov 2–3 | Opening speech, voice selection and recovery could create duplicate greetings or leave a learner listening without a prompt. | Preserve explicit microphone consent, avoid the duplicate welcome, and restore the interrupted task after a voice change. | Local `29781c6`, `4b12361`, `740cd6a` |
| Nov 3 | A process-local verification session or usage counter cannot coordinate serverless instances. | Use separate Vercel projects and an optional shared Redis store for verification and usage safeguards. The prior VPS package remains historical. | Local `77204f1`, `fe2dc75`, [ADR-004](DECISIONS/004-shared-deployment-state.md) |
| Nov 3 | Explore ignored a selected pause setting. Practice feedback could lose context, and the default voice pace was too fast for the owner. | Honor the selected pause, retain verified practice feedback and set a 0.8× speech baseline with saved preference handling. | Public `9295943`, `0b7405b`, `5a031dd` |

These are milestone summaries. Git remains the per-commit record of smaller changes. A local hash identifies evidence in the historical checkout and may be absent from GitHub. Where a rationale is inferred from the failure and corresponding change, treat it as an engineering reconstruction.
