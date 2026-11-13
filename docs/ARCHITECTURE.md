# Architecture

Vite and React render the learner interface. App owns the shared conversation session and speech player. Screen handlers resolve actions and lesson context. LessonRunner manages curriculum stages and calls FastAPI for equation state, verification and tutoring. The browser recognition adapter handles en-GH utterances. The speech planner maps expression trees to grouped speech phrases, which the browser synthesis adapter plays.

FastAPI validates requests, rate-limits model routes and applies usage reservations. The central orchestrator sends bounded context to Meta Chat Completions and validates JSON plans. React independently checks available actions and stage transitions. SymPy verifies original and working equations, restrictions and answers. Optional shared Redis stores session state and aggregate usage across server instances. Model credentials are server-side.

On the separate voice branch, the controller can arm a local playback detector after synthesis starts. An accepted interruption invalidates the active turn, cancels playback and waits for the speaker tail before recognition. The lesson continues to own the verified equation and curriculum state. The experimental backend can consume upstream model events, but its public API delivers a validated plan as a single JSON response.

See [voice](VOICE_SYSTEM.md), [mathematics](MATHEMATICS_ENGINE.md), [decisions](DECISIONS/README.md) and the [backend README](../backend/README.md).

## How a learner turn moves through the system

1. [App](../src/App.tsx) owns the conversation across Home, Lessons, Explore and Settings. The active screen receives the utterance and supplies its current question, actions and relevant state. Switching screens changes the target of a turn without giving each screen a separate microphone owner.
2. [Browser recognition](../src/speech/recognition.ts) turns microphone input into text. [ConversationSession](../src/speech/conversationSession.ts) coordinates recognition, processing, speech and silence. The model receives text and task context. It does not control the physical microphone.
3. [LessonRunner](../src/views/LessonRunner.tsx) owns curriculum position and what the learner is being asked to demonstrate. It can propose or request an operation, ask for clarification, offer a hint or return to a previous step. Those teaching decisions are distinct from mathematical verification.
4. [FastAPI](../backend/app/main.py) exposes session creation, state retrieval, verification and undo. The step route verifies against the working equation and stores the authoritative mathematical result. The orchestrator route uses a bounded context to ask Muse Spark for a structured teaching plan. The frontend applies only actions it can execute in its current context.
5. The speech layer renders grouped mathematical phrases and coordinates output with recognition. Once a question or other invitation is spoken, the conversation controller can reopen recognition. Speech completion by itself does not establish that a problem is solved.

## State and failure boundaries

| State or decision | Owner | Why it lives there |
| --- | --- | --- |
| Current screen, lesson stage, review cursor and learner preferences | React and browser persistence | The learner can navigate, review or resume without making a model call for each UI action. |
| Working equation, restrictions, verified progress and undo | Backend verifier and session store | A model plan or arithmetic aside cannot substitute for the verifier's decision. |
| Teaching interpretation and response proposals | Muse Spark and orchestrator validation | The tutor can understand varied language while the application retains control of actions and progress. |
| Request deduplication, usage reservations and shared verification state | Backend request and storage layers | A second function instance must use the same limits and state. See [ADR-004](DECISIONS/004-shared-deployment-state.md). |

An expired verification session, unavailable store, model timeout and browser recognition error are different failures. Diagnose them at their respective boundaries. A lost model response should not be treated as a wrong answer. During recovery, keep the current prompt and verified equation available and avoid silently submitting another model request.

For an implementation change, test the entry point where a learner actually encounters it. A verifier test proves a mathematical invariant. An integrated journey proves that the UI uses the verdict, plays the appropriate response, and returns to the correct question. Physical audio tests establish what actually came out of the speaker and entered the microphone.
