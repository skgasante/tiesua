import { expect, it } from 'vitest';
import { voiceReturn } from './voiceReturn';
import { voicePreviewPrompt } from './voicePreview';
it.each(['Keeping that voice.', 'All right. Back to your original voice.', 'I have cancelled the voice change.'])('acknowledges %s and restores the full interrupted instruction', ack => {
  const task = 'Imagine twelve sweets and four friends. What does equally mean?';
  expect(voiceReturn(ack, task)).toBe(ack + ' Back to where we were. ' + task);
});
it.each([1, 2, 5])('announces the last of %i voices without offering a nonexistent next voice', count => {
  const prompt = voicePreviewPrompt(count - 1, count);
  expect(prompt).toMatch(count === 1 ? /only matching voice/ : /last voice/);
  expect(prompt).not.toMatch(/try the next|try another/);
  expect(prompt).toMatch(/keep this voice/);
  expect(prompt).toMatch(/cancel/);
});
it('offers another voice only while one remains', () => {
  expect(voicePreviewPrompt(0, 2)).toContain('try the next one');
});
