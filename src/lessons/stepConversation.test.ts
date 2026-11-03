import { expect, it } from 'vitest';
import { StepConversation } from './stepConversation';

it('keeps complementary answers and the follow-up question in the same step', () => {
  const memory = new StepConversation();
  memory.record('recap', 'four friends shared and each got three', 'How many sweets did we start with?', 'partial', true);
  expect(memory.context('recap').recent_turns[0].learner).toContain('each got three');
  memory.record('recap', '12', 'Yes.', 'correct', true);
  expect(memory.context('recap').answers_without_progress).toBe(0);
});
it('preserves corrections as corrections and does not count help requests as failed answers', () => {
  const memory = new StepConversation();
  memory.record('recap', 'five friends', 'How many friends?', 'incorrect', true);
  memory.record('recap', 'I mean four friends', 'And how many each?', 'partial', true);
  memory.record('recap', 'Can you explain?', 'Let us share them out.', 'unanswered', false);
  expect(memory.context('recap').recent_turns.map(t => t.learner)).toEqual(['five friends', 'I mean four friends', 'Can you explain?']);
  expect(memory.context('recap').answers_without_progress).toBe(2);
});
it('clears evidence on a different displayed step and bounds stored speech', () => {
  const memory = new StepConversation();
  for (let i = 0; i < 10; i++) memory.record('one', 'x'.repeat(1000), 'y'.repeat(1000), 'partial', true);
  const turns = memory.context('one').recent_turns;
  expect(turns).toHaveLength(3);
  expect(JSON.stringify(turns).length).toBeLessThan(1250);
  expect(memory.context('two')).toEqual({ recent_turns: [], answers_without_progress: 0 });
});
