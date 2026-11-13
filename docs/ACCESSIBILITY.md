# Accessibility

Primary users include blind and low-vision Ghana JHS learners. Preserve keyboard Talk, Stop, typing, the optional Talk shortcut, and app voice, screen-reader, and combined announcement modes. Keep speech status and recovery available without sight. Respect user-selected pace and silence intervals.

Automated tests check semantics and conversation transitions. Physical listening checks require headphones, laptop and mobile speakers, plus NVDA or another relevant reader. Check consent, interruption, recovery, pauses, accents, false triggers, expression grouping and keyboard focus. Record setup, outcome and sample count. Do not infer screen-reader behaviour from an accessibility tree.

The headphones pilot is session-only and uses a labeled native checkbox. Screen-reader announcement modes use the explicit microphone or optional Alt+T shortcut. The device matrix must cover accidental overlap with screen-reader speech as well as app synthesis.

## Reproducible acceptance journeys

| Journey | What to observe |
| --- | --- |
| Start from Home with a keyboard | Reach the microphone, typing control, Study and platform guide in a meaningful focus order. Microphone permission follows an explicit action. If permission fails, hear or discover a usable recovery path. |
| Move from Home into the lesson | A spoken choice should lead to the intended activity. Hear its current question before the microphone opens. Settings and tab changes should preserve the lesson position. |
| Solve and recover | Give an incorrect multiplication result, ask for help, then correct it. Hear feedback tied to the actual mistake and the same problem. Hear both sides of the equation and the grouping before any progression. |
| Review earlier steps | Move back by keyboard and by a spoken request where supported. Ask about the earlier step. Return to the furthest reached step without unlocking unseen steps. |
| Use a screen reader | Compare app voice, screen reader and combined modes. Check focus, status announcements, button labels, speech overlap and the accessible interruption control. Record the reader version, browser and device. |
| Finish the lesson | Hear that the activity ended and which choices are available. Ask a question, request practice or leave. The app should explain what input it expects whenever it opens a response turn. |

Run each journey at default and increased text size where relevant. Record the exact screen and prompt when it fails. For audio tests use consenting adult testers and synthetic examples. These journeys are a protocol. Record completed checks and actual results separately.
