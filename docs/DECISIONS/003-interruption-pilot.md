# ADR-003. Local interruption pilot and validated response delivery

Recorded 2026-11-11. Implemented on the voice branch. Physical acceptance pending.

The historical loudspeaker experiment let the tutor hear itself. We considered continuing manual interruption only, using a local analyser before recognition, and capturing both playback and microphone audio through a different speech provider. A local analyser and headphones opt-in preserve the browser voices and avoid a new provider charge. They also leave a short capture gap and depend on the actual audio route. The default remains the established explicit Talk and Stop controls. A device-change event returns to those controls. Reported echo cancellation is a capability check, and its effectiveness needs physical measurement.

Muse can stream text upstream. The existing teaching response includes proposed actions, continuation and mathematical claims in one JSON plan. Sending partial sentences before the plan passes validation could speak unsafe feedback. Upstream streaming is optional and used to measure time to content. The browser receives one validated result and uses its existing phrase queue. Browser abort prevents obsolete replies. It does not guarantee the provider stops computing or billing.

Related records are the [voice implementation](../VOICE_SYSTEM.md), [experiments](../EXPERIMENTS.md), and [Muse decision](002-muse-spark.md).
