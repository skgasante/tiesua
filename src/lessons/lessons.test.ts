import { describe, expect, it } from 'vitest';
import { LESSONS, LESSON_ORDER, catalogueContext, getLesson, matchLessons, nextReadyLesson, resolveLessonQuery } from './catalogue';
import { FRACTIONS_PARTS } from './content/fractionsParts';
import { PROBLEMS } from '../learn/problems';
import { checkFractionItem, extractNumber } from './checker';
import { isCompleted, loadProgress, markCompleted, recordActivity, type Progress } from './progress';
import { validateAction } from '../conversation/actions';

describe('lesson catalogue', () => {
  it('has stable unique ids and a valid progression chain', () => {
    expect(new Set(LESSON_ORDER).size).toBe(LESSON_ORDER.length);
    for (const lesson of LESSONS) {
      expect(lesson.intro.length).toBeGreaterThan(0);
      expect(lesson.example.explanation.length).toBeGreaterThan(0);
      expect(lesson.recap.length).toBeGreaterThan(10);
      if (lesson.nextId) expect(getLesson(lesson.nextId)).toBeTruthy();
    }
    expect(LESSON_ORDER).toEqual(['equations-fraction']);
    expect(nextReadyLesson('fractions-parts')).toBeNull();
    expect(nextReadyLesson('equations-fraction')).toBeNull();
  });
  it('equations lessons only reference verified problem-bank entries', () => {
    const ids = new Set(PROBLEMS.map((p) => p.id));
    for (const lesson of LESSONS.filter((l) => l.kind === 'equations')) {
      expect(ids.has(lesson.guidedProblemId!)).toBe(true);
      expect(ids.has(lesson.independentProblemId!)).toBe(true);
      for (const extra of lesson.extraProblemIds ?? []) expect(ids.has(extra)).toBe(true);
    }
  });
  it('fractions items all have checked answers and teaching text', () => {
    const lesson = FRACTIONS_PARTS;
    for (const item of [...lesson.guidedItems!, ...lesson.guidedExtraItems!, ...lesson.independentItems!]) {
      expect(Number.isInteger(item.answer)).toBe(true);
      expect(item.teach.length).toBeGreaterThan(10);
    }
    expect(lesson.independentItems!.length).toBeGreaterThanOrEqual(3);
  });
  it('the active lesson has contextual questions and no obsolete example check', () => {
    for (const lesson of LESSONS) {
      expect(lesson.clarifyHint.length).toBeGreaterThan(8);
      expect(lesson.exampleCheck).toBeUndefined();
      expect(lesson.example.steps?.length).toBe(32);
      expect(lesson.example.steps?.every(step => Boolean(step.guidance))).toBe(true);
    }
  });
});

describe('executor catalogue lookup (not a conversational router)', () => {
  // matchLessons is used ONLY to execute an orchestrator-chosen
  // lesson.openLesson query, and by the visual Lessons browse page.
  // What the learner MEANT is decided by Meta, never by this lookup.
  it('finds a lesson for an AI-chosen query, honestly empty otherwise', () => {
    expect(matchLessons('Solving Equations with a Fraction')[0]?.id).toBe('equations-fraction');
    expect(matchLessons('Parts of a Whole')).toEqual([]);
    expect(matchLessons('teach me about brackets')).toEqual([]);
  });
  it('decisive resolution: an exact title opens even though a word is shared', () => {
    // Regression for the live failure: TieSua said "Let's open
    // Solving Equations with a Fraction" but stayed on Lessons,
    // because the lookup returned both lessons (shared "fraction")
    // and the executor treated the exact request as ambiguous.
    expect(resolveLessonQuery('Solving Equations with a Fraction')).toEqual({ kind: 'open', lesson: getLesson('equations-fraction') });
    expect(resolveLessonQuery('Parts of a Whole').kind).toBe('none');
    expect(resolveLessonQuery('fractions-parts')).toEqual({ kind: 'none' });
    expect(resolveLessonQuery('equations-fraction')).toEqual({ kind: 'open', lesson: getLesson('equations-fraction') });
    expect(resolveLessonQuery('Equations').kind).toBe('open');
    expect(resolveLessonQuery('teach me about brackets')).toEqual({ kind: 'none' });
  });
  it('catalogue context separates ready lessons from coming-soon honestly', () => {
    const ctx = catalogueContext();
    const fractions = ctx.find((c) => c.topic === 'Fractions')!;
    expect(fractions.ready).toEqual([]);
    expect(fractions.comingSoon).toContain('Equivalent fractions');
    const equations = ctx.find((c) => c.topic === 'Equations')!;
    expect(equations.ready).toContain('Solving Equations with a Fraction');
  });
});

describe('AI-FIRST CONTRACT: decision authority', () => {
  // The production lesson module must not grow back a phrasebook.
  // Meaning is Meta's job; deterministic code verifies and executes.
  it('the former local routers are gone from the lesson intent module', async () => {
    const mod = await import('./intent') as Record<string, unknown>;
    for (const name of ['routeDecision', 'resolveTopicRequest', 'lessonIntent', 'homeIntent', 'resolvePendingChoice', 'isLessonRequest', 'isCorrection', 'scoreLessons']) {
      expect(mod[name], name).toBeUndefined();
    }
  });
  it('lesson.openLesson is the only conversational way in, and it is registry-validated', () => {
    expect(validateAction({ name: 'lesson.openLesson', args: { query: 'equations' } })?.args.query).toBe('equations');
    expect(validateAction({ name: 'lesson.openLesson', args: { query: '' } })).toBeNull();
    expect(validateAction({ name: 'lesson.openLesson', args: { query: 'x'.repeat(61) } })).toBeNull();
  });
});

describe('fraction answer checking', () => {
  it('accepts digits and number words, judges wrong numbers, never guesses', () => {
    expect(checkFractionItem(3, '3')).toBe(true);
    expect(checkFractionItem(3, 'three')).toBe(true);
    expect(checkFractionItem(5, 'the denominator is five')).toBe(true);
    expect(checkFractionItem(3, 'four')).toBe(false);
    expect(checkFractionItem(3, 'the top one')).toBeNull();
    expect(extractNumber('twelve')).toBe(12);
  });
});

describe('progress persistence', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('repeating a lesson increments, never erases, completion', () => {
    const store = mem();
    let p: Progress = loadProgress(store);
    p = markCompleted(p, 'fractions-parts', '2026-01-01T00:00:00Z');
    p = markCompleted(p, 'fractions-parts', '2026-01-02T00:00:00Z');
    expect(p.completed['fractions-parts'].completions).toBe(2);
    expect(isCompleted(p, 'fractions-parts')).toBe(true);
    p = recordActivity(p, 'equations-fraction');
    expect(p.lastLessonId).toBe('equations-fraction');
    expect(isCompleted(p, 'fractions-parts')).toBe(true);
  });
});

describe('lesson actions in the safe registry', () => {
  it('validates new lesson actions and rejects malformed ones', () => {
    expect(validateAction({ name: 'lesson.repeatLesson' })?.name).toBe('lesson.repeatLesson');
    expect(validateAction({ name: 'lesson.nextLesson' })?.name).toBe('lesson.nextLesson');
    expect(validateAction({ name: 'lesson.morePractice', args: { mode: 'guided' } })?.args.mode).toBe('guided');
    expect(validateAction({ name: 'lesson.morePractice', args: { mode: 'sideways' } })).toBeNull();
    expect(validateAction({ name: 'nav.openLessons' })?.name).toBe('nav.openLessons');
  });
});
