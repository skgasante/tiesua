# Voice system

The baseline routes one utterance at a time through ConversationSession. Web Speech recognition defaults to two seconds of quiet after final recognition and offers 3, 5 and 8 seconds. Browser end events can arrive sooner. Playback owns a generation ID and suspends recognition synchronously. The 300 ms guard allows speaker tails to clear. The original experimental lab requests browser audio processing and uses sustained RMS to detect onset. It cannot identify the speaker.

## Separate voice branch

The experimental implementation has a session-only headphones pilot under Settings, then Interaction. Turn on conversation before enabling it. It requests echo cancellation, noise suppression and gain control. It requires reported echo cancellation support and confirms that the selected track reports it active. The microphone analyser runs locally during native synthesis segments. Four consecutive 40 ms analysis frames with elevated energy and periodicity are required before playback cancellation. A pitched sound can still trigger it. The original lab uses a separate experimental detector.

Native recognition opens after the existing 300 ms speaker tail. There is no microphone pre-roll passed to recognition. Start with “Wait”, then speak the question after the listening cue if the first words tend to be clipped. A matching long playback transcript is discarded during pilot recovery. An empty interruption replays once with detection temporarily suspended. Saying “continue” after a follow-up can replay the original explanation without changing the verified step. The microphone button remains an explicit interruption control, including when hands-free is off. If enabled in Settings, Alt+T provides the same control across screens. Screen-reader and combined announcement modes suspend acoustic interruption.

In the experimental implementation, only final recognition segments can submit an answer. The browser may close its listening window before the learner finishes. The quiet period remains adjustable. The app does not send analyser audio to a server. Browser speech recognition can use the browser vendor's network service.

See [experiments](EXPERIMENTS.md) for timings and [known issues](KNOWN_ISSUES.md) for the physical acceptance gaps.
