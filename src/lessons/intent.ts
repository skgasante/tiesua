/** Lesson stage vocabulary.
 *
 * AI-first architecture: there is deliberately NO local lesson
 * router, topic matcher or intent phrasebook in the production
 * path. Every meaningful learner utterance is decided by the
 * central Meta orchestrator (backend/app/orchestrator.py) and
 * executed through the validated action registry. Deterministic
 * code here owns only: mathematical verification, catalogue
 * lookup at execution time, stage preconditions, and immediate
 * controls such as stop-speaking. */

export type LessonStage =
  | 'intro' | 'example' | 'guided' | 'choice' | 'independent' | 'complete' | 'awaiting-topic';
