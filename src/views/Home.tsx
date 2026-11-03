import { useEffect, useState } from 'react';
import { getLesson } from '../lessons/catalogue';
import { recognitionSupported } from '../speech/recognition';
import type { ConversationFacade } from '../App';
import { PHASE_LABEL } from '../speech/conversationSession';
import { StopSpeakingButton } from '../components/GlobalConversation';
import type { useSpeech } from '../speech/useSpeech';
import '../design/minimal.css';

type Player = ReturnType<typeof useSpeech>;

interface Props {
  active?: boolean;
  player: Player;
  onOpenLesson: (id: string) => void;
  onBrowse: () => void;
  onGuide: () => void;
  lastLessonId?: string;
  handleRequest: (text: string) => Promise<void>;
  conversation: ConversationFacade;
}

/** Minimal Home: one question, one microphone, one keyboard icon.
 * AI-first: EVERY meaningful request is decided by the central Meta
 * orchestrator. This component only executes validated actions.
 * When live AI is unavailable it says so honestly — it never falls
 * back to a local lesson matcher pretending to understand. */
export function Home({ active = true, player, onOpenLesson, onBrowse, onGuide, lastLessonId, handleRequest, conversation }: Props) {
  const [sheet, setSheet] = useState(false);
  const [input, setInput] = useState('');
  const [heard, setHeard] = useState('');
  const voiceSupported = recognitionSupported();
  // Register with the ONE application conversation session: it
  // owns the microphone, auto-listens after speech, and dispatches
  // each utterance here exactly once - across navigation.
  useEffect(() => {
    if (!active) return;
    conversation.register('home', async (text) => { setHeard(text); await handleRequest(text); }, setHeard);
    return () => conversation.unregister('home');
  }, [active, conversation, handleRequest]);

  const last = lastLessonId ? getLesson(lastLessonId) : undefined;
  return (
    <section className="mn-home" aria-labelledby="home-heading">
      <h1 id="home-heading" className="mn-ask">What would you like to learn today?</h1>
      <div className="mn-voice">
        <button type="button" className={conversation.listening ? 'mn-mic mn-mic-live' : 'mn-mic'} onClick={() => conversation.toggle()} disabled={!voiceSupported && !conversation.enabled} aria-pressed={conversation.enabled} aria-label={conversation.enabled ? 'End hands-free conversation' : 'Start hands-free conversation'}>
          <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" fill="currentColor" /></svg>
        </button>
        <p className="mn-status" role="status">{conversation.enabled ? (player.preparing ? 'Preparing speech' : PHASE_LABEL[conversation.phase]) : 'Microphone off - tap the microphone to talk hands-free'}</p>
        <div className="home-voice-tools"><button type="button" className="mn-kbd" aria-label="Type instead" aria-expanded={sheet} onClick={() => setSheet((s) => !s)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 2-2V7a2 2 0 0 1 2-2zm2 3v2h2V8H6zm4 0v2h2V8h-2zm4 0v2h2V8h-2zm4 0v2h2V8h-2zM6 12v2h2v-2H6zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 16v2h10v-2H7z" fill="currentColor" /></svg>
        </button>
        <StopSpeakingButton player={player} /></div>
        {!voiceSupported && <p className="mn-fine">Voice is not available in this browser - the keyboard works fully.</p>}
        {heard && !conversation.listening && <p className="mn-heard">You said: "{heard}"</p>}
      </div>
      {sheet && (
        <form className="mn-sheet mn-sheet-static" onSubmit={(e) => { e.preventDefault(); setSheet(false); void handleRequest(input); setInput(''); }}>
          <label className="mn-sheet-label" htmlFor="home-input">What would you like to learn?</label>
          <input id="home-input" className="mn-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type here..." autoComplete="off" autoFocus />
          <div className="mn-sheet-actions">
            <button type="submit" className="mn-send">Send</button>
            <button type="button" className="mn-cancel" onClick={() => setSheet(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="home-choices">
        <button type="button" className="mn-browse" onClick={onBrowse}><svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6c-2.5-2-5-2-9-1v13c4-1 6.5-1 9 1m0-13c2.5-2 5-2 9-1v13c-4-1-6.5-1-9 1m0-13v13"/></svg>Study</button>
        <button type="button" className="mn-browse" onClick={onGuide}><svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01" strokeLinecap="round"/></svg>How TieSua works</button>
      </div>
      {last && <button type="button" className="mn-browse home-continue" onClick={() => onOpenLesson(last.id)}>Continue: {last.title}</button>}
    </section>
  );
}
