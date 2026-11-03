import { api } from '../learn/api';
import { validateAction } from './actions';

export function voicePreviewPrompt(index: number, count: number): string {
  const position = count === 1 ? 'This is the only matching voice.' : `Voice ${index + 1} of ${count}.${index === count - 1 ? ' This is the last voice.' : ''}`;
  const choices = index + 1 < count
    ? 'Would you like to keep this voice, try the next one, or go back?'
    : 'Would you like to keep this voice, go back, or cancel the voice change?';
  return `${position} Hello, I can read mathematics with this voice. ${choices}`;
}

/** Meta interprets the learner's words; this only accepts a valid preview action. */
export async function interpretVoicePreview(text: string, screen: string, index: number, count: number): Promise<'keep' | 'next' | 'previous' | 'cancel' | null> {
  const result = await api.orchestrate(text, {
    screen, voice_preview: { active: true, index: index + 1, count },
    current_question: voicePreviewPrompt(index, count),
    available_actions: ['speech.previewVoice keep', ...(index + 1 < count ? ['speech.previewVoice next'] : []), 'speech.previewVoice previous', 'speech.stop'],
  });
  if (result.source !== 'live-meta' && result.source !== 'mock') return null;
  const actions = (result.actions ?? []).map(validateAction).filter(a => a !== null);
  if (actions.length !== 1) return null;
  const action = actions[0];
  if (action.name === 'speech.stop') return 'cancel';
  if (action.name !== 'speech.previewVoice') return null;
  const direction = action.args.direction;
  return direction === 'keep' || direction === 'next' || direction === 'previous' ? direction : null;
}
