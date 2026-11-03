/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ConversationText } from './ConversationText';
it('hides either caption or both independently and remembers the preference', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const el = document.createElement('div'); document.body.appendChild(el);
  let root = createRoot(el);
  const content = <><ConversationText label="Last said" text="Current tutor words" live="polite"/><ConversationText label="Last heard" text="Current learner words"/></>;
  await act(async () => root.render(content));
  const press = async (label: string) => { const button = el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!; expect(button).not.toBeNull(); await act(async () => button.click()); };
  await press('Hide last said');
  expect(el.querySelectorAll('p.sr-only')).toHaveLength(1);
  expect(el.querySelector('[aria-live="polite"]')?.textContent).toBe('Current tutor words');
  await press('Hide last heard'); expect(el.querySelectorAll('p.sr-only')).toHaveLength(2);
  await act(async () => root.unmount()); root = createRoot(el);
  await act(async () => root.render(content)); expect(el.querySelectorAll('p.sr-only')).toHaveLength(2);
  await press('Show last said'); expect(el.querySelectorAll('p.sr-only')).toHaveLength(1);
  await press('Show last heard'); expect(el.querySelectorAll('p.sr-only')).toHaveLength(0);
  await act(async () => root.unmount()); el.remove(); localStorage.clear();
});
