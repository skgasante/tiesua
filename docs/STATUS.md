# Current status

## Public main

The documented application baseline is `5a031dd`, dated 2026-11-03. It provides voice navigation, browser recognition and synthesis, lesson progression, verified algebra and spoken grouping. Explicit microphone and stop controls are the supported interruption route. The default speech baseline is 0.8×. See the [changelog](../CHANGELOG.md) for the changes after the public source snapshot.

## Separate voice work

The `codex/voice-interruption` working tree contains a session-only headphones pilot, standalone repeat and slower controls, obsolete-request cancellation, transcript-free diagnostics and optional upstream streaming. The branch changes were still local at the documentation handoff. The benchmark and physical acceptance requirements are recorded so work can resume without relying on prior conversations. See [experiments](EXPERIMENTS.md) and [known issues](KNOWN_ISSUES.md).

The voice worktree passed 600 frontend tests, 263 backend tests and the production build in its implementation pass. The comparison used 20 synthetic live model calls. Physical interruption, loudspeaker echo, mobile, Ghanaian English and screen-reader acceptance remain open. Start with a device matrix and record false interruptions and tutor echo before considering wider rollout.

## Documentation handoff

The 2026-11-13 documentation change introduces the public handbook, historical evidence, decision records, alternatives and automated documentation checks. Review [project history](PROJECT_HISTORY.md) and [the decision register](DECISIONS/README.md) before editing. The older local history is an evidence source with private material. Publish only reviewed summaries.
