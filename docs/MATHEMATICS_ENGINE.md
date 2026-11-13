# Mathematics engine

[Backend parser](../backend/app/mathparse.py) converts supported symbolic and spoken mathematics. [Verifier](../backend/app/verifier.py) checks operations, equivalent equations, original solutions and domain restrictions with SymPy. Numerical equalities cannot replace an algebra equation. Model proposals never authorize a state change on their own. [LessonRunner](../src/views/LessonRunner.tsx) checks lesson stages and dispatches accepted work to the verifier.

[Speech plans](../src/speech/speechPlan.ts) distinguish `(x+2)/4` (“x plus two, all over four”) from `x+(2/4)` (“x, plus two over four”). [Rendering](../src/speech/render.ts) groups complete mathematical phrases and uses learner-selected pauses. Preserve these boundaries during playback, replay or transport changes.

Use the Ghana JHS problem bank and the existing parser, verifier and speech-plan tests as regression fixtures.
