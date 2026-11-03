import { describe, expect, it, vi } from 'vitest';
import { canExecuteLessonAction, executeSharedAction, type ActionEnvironment } from './actionExecutor';
const environment = (): ActionEnvironment => ({
  settings: { rate: 1, pauseScale: 1, volume: 1, textSize: 100 },
  patch: vi.fn(), temporary: vi.fn(), navigate: vi.fn(), stop: vi.fn(),
});

describe('shared application action executor', () => {
  it.each(['home', 'lesson', 'settings', 'explore'])('applies the same temporary rule on %s', () => {
    const env = environment();
    expect(executeSharedAction({ name: 'speech.setPauses', args: { delta: -.5 }, scope: 'temporary' }, env)).not.toBeNull();
    expect(env.temporary).toHaveBeenCalledWith({ pauseScale: .5 });
    expect(env.patch).not.toHaveBeenCalled();
  });
  it('validates before mutating and exposes unsupported capabilities', () => {
    const env = environment();
    expect(executeSharedAction({ name: 'speech.setRate', args: { value: 'fast' } }, env)).toBeNull();
    expect(executeSharedAction({ name: 'lesson.hint', args: {} }, env)).toBeNull();
    expect(env.patch).not.toHaveBeenCalled();
    expect(executeSharedAction({ name: 'nav.openHear' }, env)?.action.name).toBe('nav.openHear');
    expect(env.navigate).toHaveBeenCalledWith('explore');
  });
  it.each(['lesson.morePractice', 'lesson.nextProblem', 'lesson.continue', 'nav.goHome'] as const)('blocks %s after confusion but permits explicit leaving', (name) => {
    const action = { name, args: {} };
    expect(canExecuteLessonAction(action, true, "I don't understand three times four")).toBe(false);
    expect(canExecuteLessonAction(action, true, 'What do you expect me to do?')).toBe(false);
    expect(canExecuteLessonAction(action, true, 'skip this question')).toBe(false);
    expect(canExecuteLessonAction(action, false, 'continue')).toBe(true);
  });
});


it('plays both meanings through the approved speech planner', () => {
  const env = environment();
  const demonstrate = vi.fn();
  expect(executeSharedAction({ name: 'demo.hearClear' }, { ...env, demonstrate })).not.toBeNull();
  const plan = demonstrate.mock.calls[0][0];
  const text = plan.segments.map((part: { text: string }) => part.text).join(' ');
  expect(text).toContain('all over');
  expect(env.patch).not.toHaveBeenCalled();
});
