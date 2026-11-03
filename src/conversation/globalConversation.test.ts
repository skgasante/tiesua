import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/catalogue';
import { isStopSpeakingPhrase, lessonsAnnouncement, replyNamesLesson } from './globalConversation';

describe('global conversation helpers (secondary screens)', () => {
  it('announces the actual lessons in order, with ordinals for voice selection', () => {
    const text = lessonsAnnouncement(LESSONS);
    expect(text).not.toContain('Parts of a Whole');
    expect(text).toContain('solve equations with fractions');
    expect(text).not.toContain('second');
    expect(text).toContain('Shall we begin?');
  });

  it('stop-speaking is the only instant local phrase', () => {
    expect(isStopSpeakingPhrase('Stop speaking')).toBe(true);
    expect(isStopSpeakingPhrase('stop')).toBe(true);
    expect(isStopSpeakingPhrase("I'm done for today")).toBe(false);
    expect(isStopSpeakingPhrase('stop the lesson and go home')).toBe(false);
  });

  it('detects when a reply already names a lesson (no double announcement)', () => {
    expect(replyNamesLesson('We can do Parts of a Whole.', LESSONS)).toBe(false);
    expect(replyNamesLesson('Let us look at equations today.', LESSONS)).toBe(true);
    expect(replyNamesLesson('Sure, let us begin.', LESSONS)).toBe(false);
  });
});
