import { useCallback, useRef, useState } from 'react';
import type { useSpeech } from '../speech/useSpeech';
import type { ConversationFacade } from '../App';
import { PHASE_LABEL } from '../speech/conversationSession';

type Player = ReturnType<typeof useSpeech>;

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" fill="currentColor" /></svg>
);
const KbdIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 3v2h2V8H6zm4 0v2h2V8h-2zm4 0v2h2V8h-2zm4 0v2h2V8h-2zM6 12v2h2v-2H6zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 16v2h10v-2H7z" fill="currentColor" /></svg>
);

/** Genuine stop-speaking control, usable on every screen. */
export function StopSpeakingButton({ player }: { player: Player }) {
  return (
    <button type="button" className="mn-stop" onClick={() => player.stop()} disabled={!player.speaking} aria-label="Stop speaking">
      Stop
    </button>
  );
}

/** Shared compact conversation control for secondary screens
 * (Lessons, Explore, Settings). The microphone and typing go
 * through the ONE application conversation session - this
 * component owns no recogniser of its own. */
export function GlobalConversation({ player, screenName, conversation, onText }: {
  player: Player;
  screenName: string;
  conversation: ConversationFacade;
  onText: (text: string) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const kbdRef = useRef<HTMLButtonElement>(null);

  const closeSheet = useCallback(() => {
    setSheet(false);
    window.setTimeout(() => kbdRef.current?.focus(), 30);
  }, []);

  return (
    <div className="mn-globalbar" aria-label={`Talk to TieSua on ${screenName}`}>
      <button type="button" className={conversation.listening ? 'mn-mic mn-mic-compact mn-mic-live' : 'mn-mic mn-mic-compact'}
        onClick={() => conversation.listenOnce()} aria-pressed={conversation.listening}
        aria-label={conversation.listening ? 'Stop listening' : `Talk to TieSua on ${screenName}`}>
        <MicIcon />
      </button>
      <button type="button" ref={kbdRef} className="mn-kbd" aria-label="Type instead" aria-expanded={sheet}
        onClick={() => { setSheet((s) => !s); window.setTimeout(() => inputRef.current?.focus(), 50); }}>
        <KbdIcon />
      </button>
      <StopSpeakingButton player={player} />
      <button type="button" className="mn-stop" aria-pressed={conversation.enabled} onClick={() => conversation.toggle()}
        aria-label={conversation.enabled ? 'End hands-free conversation' : 'Start hands-free conversation'}>
        {conversation.enabled ? (player.preparing ? 'Preparing speech' : PHASE_LABEL[conversation.phase]) : 'Microphone off'}
      </button>
      {conversation.listening && <p className="mn-status" role="status">Listening…</p>}
      {sheet && (
        <form className="mn-sheet mn-sheet-static" onSubmit={(e) => { e.preventDefault(); const v = input; setInput(''); closeSheet(); onText(v); }}>
          <label className="mn-sheet-label" htmlFor={`global-input-${screenName}`}>Say or type anything</label>
          <input id={`global-input-${screenName}`} ref={inputRef} className="mn-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type here..." autoComplete="off" />
          <div className="mn-sheet-actions">
            <button type="submit" className="mn-send">Send</button>
            <button type="button" className="mn-cancel" onClick={closeSheet}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
