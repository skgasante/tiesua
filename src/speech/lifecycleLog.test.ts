/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
it('keeps timestamped local diagnostics across reloads and clears them', async () => {
  localStorage.clear(); vi.resetModules();
  const first = await import('./lifecycleLog');
  first.setLifecycleLogEnabled(true);
  first.logLifecycle('lesson.step', 'advance -> step 6');
  expect(JSON.parse(localStorage.getItem('tiesua-diagnostics')!)[0].at).toMatch(/^\d{4}-/);
  vi.resetModules();
  const restored = await import('./lifecycleLog');
  expect(restored.getLifecycleEvents()[0].detail).toBe('advance -> step 6');
  restored.clearLifecycleEvents();
  expect(localStorage.getItem('tiesua-diagnostics')).toBeNull();
});
