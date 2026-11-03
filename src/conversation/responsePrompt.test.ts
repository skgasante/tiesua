import { expect, it } from 'vitest';
import { responsePrompt } from './responsePrompt';
import { EQUATION_JOURNEY } from '../lessons/equationJourney';
it.each(EQUATION_JOURNEY.flatMap(step => ['That is right.', 'Let us think about the same amount.'].map(reply => ({ step, reply }))))('keeps a task after statement feedback: $step.title / $reply', ({step, reply}) => {
  expect(responsePrompt(reply, step.prompt)).toMatch(/\?|tell me/i);
  expect(responsePrompt(reply, step.prompt)).toContain(reply);
});
it('does not add another question to a contextual question', () => {
  expect(responsePrompt('Which number is the total?', 'What does x mean?')).toBe('Which number is the total?');
});
