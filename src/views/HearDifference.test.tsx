/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HearDifference } from './HearDifference';
import { planText } from '../speech/speechPlan';

afterEach(() => { document.body.innerHTML = ''; });

it('plays distinct readings and keeps additional expression tools accessible', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const speak = vi.fn();
  const player = { speak, speaking: false, stop: vi.fn(), replay: vi.fn(), caption: '' } as any;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<HearDifference player={player} />));
  const first = document.querySelector<HTMLButtonElement>('[aria-label="Hear (x+2)/4"]')!;
  const second = document.querySelector<HTMLButtonElement>('[aria-label="Hear x+(2/4)"]')!;
  const fractions = [...document.querySelectorAll('[role="img"]')];
  expect(fractions[0].getAttribute('aria-label')).toMatch(/all over/);
  expect(fractions[1].getAttribute('aria-label')).toMatch(/two over four/);
  await act(async () => first.click());
  await act(async () => second.click());
  expect(planText(speak.mock.calls[0][0])).toMatch(/all over/);
  expect(planText(speak.mock.calls[1][0])).not.toMatch(/all over/);
  const more = [...document.querySelectorAll('button')].find(b => b.textContent === 'Explore more expressions')!;
  await act(async () => more.click());
  expect(document.querySelectorAll('.expression-list-row')).toHaveLength(5);
  const explore = [...document.querySelectorAll('.expression-explore')][0] as HTMLButtonElement;
  await act(async () => explore.click());
  expect(document.body.textContent).toContain('Explore this expression part by part');
  await act(async () => root.unmount());
});
