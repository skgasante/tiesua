import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../learn/api';
import { interpretVoicePreview } from './voicePreview';

afterEach(() => vi.restoreAllMocks());
it.each([
  ['I like this voice', 'keep'],
  ["I don't like this voice, try another", 'next'],
  ['the last one was better', 'previous'],
] as const)('executes the model decision for "%s"', async (utterance, direction) => {
  const request = vi.spyOn(api, 'orchestrate').mockResolvedValue({ source: 'live-meta', actions: [{ name: 'speech.previewVoice', args: { direction } }] });
  expect(await interpretVoicePreview(utterance, 'lesson', 1, 3)).toBe(direction);
  expect(request).toHaveBeenCalledWith(utterance, expect.objectContaining({ voice_preview: { active: true, index: 2, count: 3 } }));
});
it('does not guess or change a voice when the model is uncertain', async () => {
  vi.spyOn(api, 'orchestrate').mockResolvedValue({ source: 'clarification', actions: [], clarification: 'Could you say that again?' });
  expect(await interpretVoicePreview('maybe', 'home', 0, 2)).toBeNull();
});
