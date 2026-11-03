import type { LessonDef } from '../lessons/catalogue';

/** Shared conversation helpers for non-lesson screens (Lessons,
 * Explore, Settings). Meaning is decided by the central Meta
 * orchestrator; these helpers only format true application state
 * and recognise the one immediate control that must never wait
 * for a model: stop speaking. */

export function isStopSpeakingPhrase(raw: string): boolean {
  return /^(stop|stop speaking|be quiet|quiet)$/i.test(raw.trim());
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/** Conversational announcement of the real available lessons, in
 * catalogue order, so a blind learner hears the choices and can
 * answer "the second one" without discovering a visual list. */
export function lessonsAnnouncement(lessons: LessonDef[]): string {
  if (!lessons.length) return 'I do not have any lessons ready just now.';
  if (lessons.length === 1 && lessons[0].id === 'equations-fraction') {
    return "We can learn how to solve equations with fractions. We'll start with a simple sweets story, then use it to find a missing number. Shall we begin?";
  }
  if (lessons.length === 1) return `We can learn about ${lessons[0].title}. Shall we begin?`;
  const parts = lessons.map((l, i) => `${ORDINALS[i] ?? `number ${i + 1}`}, ${l.title} - ${l.clarifyHint}`);
  return `Here is what I can teach. ${parts.join('. ')}. Say the first one, the second one, or just name the lesson.`;
}

/** Whether a model reply already names at least one real lesson
 * (so the executor does not announce the list twice). */
export function replyNamesLesson(reply: string, lessons: LessonDef[]): boolean {
  const r = reply.toLowerCase();
  return lessons.some((l) => r.includes(l.title.toLowerCase()) || r.includes(l.topic.toLowerCase()));
}
