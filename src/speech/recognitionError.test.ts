import { expect, it } from 'vitest';
import { recognitionErrorMessage } from './recognitionError';

it.each([
  ['network', 'connection failed'], ['not-allowed', 'permission'],
  ['audio-capture', 'microphone audio'], ['language-not-supported', 'selected language'],
  ['unknown', 'browser error'],
])('explains %s without blaming the learner or Meta', (reason, explanation) => {
  const message = recognitionErrorMessage(reason);
  expect(message).toContain(explanation);
  expect(message).toContain('keyboard button');
  expect(message).not.toContain('Meta');
});
