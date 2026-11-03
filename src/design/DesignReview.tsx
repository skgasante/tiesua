import { useState } from 'react';
import { MathView } from '../components/MathView';
import { parseExpression } from '../math/parser';
import './design.css';

/* Design-review prototype (isolated route: /?design). Simulated states are
   labelled as such; nothing here replaces the production learner screens. */

const EQ = parseExpression('x = 10');
const PROBLEM = parseExpression('(x+2)/4 = 3');
const PROBLEM12 = parseExpression('x+2 = 12');
const HEAR_A = parseExpression('(x+2)/4');
const HEAR_B = parseExpression('x+(2/4)');

type Frame =
  | 'home-first' | 'home-return' | 'ready' | 'listening' | 'transcript' | 'checking'
  | 'correct' | 'incorrect' | 'hint' | 'settings-change' | 'interrupted' | 'completion'
  | 'hear-1' | 'hear-2' | 'prefs' | 'mic-denied' | 'service-down';

const FRAMES: { id: Frame; label: string }[] = [
  { id: 'home-first', label: 'Home - first time' },
  { id: 'home-return', label: 'Home - returning' },
  { id: 'ready', label: 'Learn - ready' },
  { id: 'listening', label: 'Learn - listening' },
  { id: 'transcript', label: 'Learn - transcript review' },
  { id: 'checking', label: 'Learn - checking' },
  { id: 'correct', label: 'Learn - correct step' },
  { id: 'incorrect', label: 'Learn - incorrect step' },
  { id: 'hint', label: 'Learn - hint' },
  { id: 'settings-change', label: 'Learn - voice change' },
  { id: 'interrupted', label: 'Learn - interrupted' },
  { id: 'completion', label: 'Learn - completion' },
  { id: 'hear-1', label: 'Hear - challenge' },
  { id: 'hear-2', label: 'Hear - revealed' },
  { id: 'prefs', label: 'Settings - preferences' },
  { id: 'mic-denied', label: 'Recovery - microphone denied' },
  { id: 'service-down', label: 'Recovery - tutor unavailable' },
];

function Dock({ active }: { active: string }) {
  const items = [
    { id: 'home', label: 'Home', icon: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z' },
    { id: 'hear', label: 'Hear', icon: 'M4 10v4h4l5 5V5L8 10H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11' },
    { id: 'learn', label: 'Learn', icon: 'M12 3L2 8l10 5 10-5-10-5z M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5' },
    { id: 'prefs', label: 'Settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z' },
  ];
  return (
    <nav className="dr-dock" aria-label="Prototype navigation (simulated)">
      {items.map((i) => (
        <span key={i.id} className={active === i.id ? 'dr-dock-item dr-dock-on' : 'dr-dock-item'} aria-current={active === i.id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={i.icon} fill="currentColor" /></svg>
          {i.label}
        </span>
      ))}
    </nav>
  );
}

function TalkButton({ state }: { state: 'idle' | 'listening' | 'off' }) {
  if (state === 'off') return <button type="button" className="dr-talk dr-talk-off" disabled>Microphone unavailable - typing below works fully</button>;
  return (
    <button type="button" className={state === 'listening' ? 'dr-talk dr-talk-live' : 'dr-talk'} aria-pressed={state === 'listening'}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" fill="currentColor" /></svg>
      {state === 'listening' ? 'Listening... tap to stop' : 'Talk to TieSua'}
    </button>
  );
}

function StageMath({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="dr-stage">
      <div className="dr-stage-math">{children}</div>
      {sub && <p className="dr-stage-sub">{sub}</p>}
      <span className="dr-stage-rule" aria-hidden="true" />
    </div>
  );
}

function AHome({ returning }: { returning?: boolean }) {
  return (
    <div className="dr-screen">
      <p className="dr-eyebrow">Tie<em>Sua</em></p>
      <h1 className="dr-h1">{returning ? 'Akwaaba back, Ama.' : "Akwaaba. Let's do mathematics you can hear."}</h1>
      <p className="dr-lede">{returning ? 'Your voice, speed and lesson are just as you left them.' : 'Listen, speak or type - TieSua teaches one step at a time, and you can talk to it like a teacher.'}</p>
      <StageMath sub="x plus two, all over four, equals three">
        <MathView node={PROBLEM} />
      </StageMath>
      <button type="button" className="dr-primary">{returning ? 'Continue your lesson' : 'Start learning'}</button>
      <button type="button" className="dr-quiet">Hear the Difference - a two-minute listening game</button>
      <p className="dr-note">Say "Talk to TieSua" any time, or press the Talk button. Typing always works too.</p>
      <Dock active="home" />
    </div>
  );
}

function LearnShellA({ frame }: { frame: Frame }) {
  const content: Record<string, React.ReactNode> = {
    ready: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <p className="dr-prompt"><span className="dr-who">TieSua</span> What operation would undo "all over four"?</p>
      <TalkButton state="idle" />
      <button type="button" className="dr-quiet">Type your answer instead</button>
      <div className="dr-chips"><button type="button">Repeat</button><button type="button">Hint</button><button type="button">Hear it slowly</button></div>
    </>),
    listening: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <p className="dr-prompt"><span className="dr-who">TieSua</span> I'm listening...</p>
      <TalkButton state="listening" />
      <p className="dr-note" role="status">Listening. Say your answer, or tap Talk again to stop.</p>
    </>),
    transcript: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <div className="dr-heard"><p className="dr-who">I heard</p><p className="dr-heard-text">"Multiply both sides by four."</p></div>
      <button type="button" className="dr-primary">Yes, that's right</button>
      <div className="dr-chips"><button type="button">Say it again</button><button type="button">Type it instead</button><button type="button">Cancel</button></div>
    </>),
    checking: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <p className="dr-prompt"><span className="dr-who">Checking</span> One moment - I'm checking that step.</p>
      <p className="dr-note" role="status">Checking your step...</p>
    </>),
    correct: (<>
      <StageMath sub="x plus two equals twelve"><MathView node={PROBLEM12} /></StageMath>
      <p className="dr-prompt dr-good"><span className="dr-who">Correct step</span> Exactly - multiplying both sides by four gives x + 2 = 12. What will you do next?</p>
      <TalkButton state="idle" />
      <button type="button" className="dr-quiet">Type your answer instead</button>
    </>),
    incorrect: (<>
      <StageMath sub="Currently: x plus two equals twelve"><MathView node={PROBLEM12} /></StageMath>
      <div className="dr-heard dr-warn"><p className="dr-who">You tried</p><p className="dr-heard-text">x + 2 = 7</p></div>
      <p className="dr-prompt"><span className="dr-who">TieSua</span> Not quite - let's look at the right side together. What is 3 x 4? Take your time.</p>
      <TalkButton state="idle" />
      <div className="dr-chips"><button type="button">Explain that step</button><button type="button">Try again</button></div>
    </>),
    hint: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <div className="dr-hint"><p className="dr-who">Hint</p><p>The "all over four" is dividing. Ask yourself: what undoes dividing by four - and remember it must happen to <strong>both</strong> sides.</p></div>
      <TalkButton state="idle" />
      <button type="button" className="dr-quiet">Back to the question</button>
    </>),
    'settings-change': (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <div className="dr-changed" role="status"><p className="dr-who">Done - by voice</p><p>New voice, speaking a little faster. Your saved voice is kept; say "go back" any time.</p></div>
      <p className="dr-prompt"><span className="dr-who">TieSua</span> Now - what operation would undo "all over four"?</p>
      <TalkButton state="idle" />
    </>),
    interrupted: (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <p className="dr-prompt"><span className="dr-who">Stopped</span> I've stopped speaking. I'm ready when you are.</p>
      <TalkButton state="idle" />
      <div className="dr-chips"><button type="button">Repeat that</button><button type="button">Continue</button></div>
    </>),
    completion: (<>
      <div className="dr-done">
        <p className="dr-done-badge" aria-hidden="true">Done</p>
        <h2 className="dr-h2">Solved - well done, Ama.</h2>
        <StageMath sub="x equals ten"><MathView node={EQ} /></StageMath>
        <p className="dr-prompt">You undid "all over four", then took away two. Two steps, both yours.</p>
        <button type="button" className="dr-primary">Try another question</button>
        <button type="button" className="dr-quiet">Hear a summary - Back home</button>
      </div>
    </>),
    'mic-denied': (<>
      <StageMath sub="x plus two, all over four, equals three"><MathView node={PROBLEM} /></StageMath>
      <div className="dr-heard dr-warn"><p className="dr-who">Microphone is off</p><p>That's okay. You can type every answer, and TieSua will still speak to you. To use your voice later, allow the microphone in your browser.</p></div>
      <button type="button" className="dr-primary">Type my answer</button>
      <button type="button" className="dr-quiet">Try the microphone again</button>
    </>),
    'service-down': (<>
      <StageMath sub="x plus two equals twelve"><MathView node={PROBLEM12} /></StageMath>
      <div className="dr-heard dr-warn"><p className="dr-who">Tutoring helper unavailable</p><p>Your step was still checked and saved. I can guide you with practice hints, or we can wait and try the tutor again.</p></div>
      <TalkButton state="idle" />
      <div className="dr-chips"><button type="button">Use a practice hint</button><button type="button">Try tutor again</button></div>
    </>),
  };
  return (
    <div className="dr-screen">
      <p className="dr-eyebrow">Tie<em>Sua</em> - Learn</p>
      {content[frame] ?? content.ready}
      <Dock active="learn" />
    </div>
  );
}

/* ---------- Direction B: "The Guided Lesson Room" ---------- */
function BHome() {
  return (
    <div className="dr-screen dr-b">
      <div className="dr-b-hero">
        <p className="dr-eyebrow dr-b-eyebrow">Tie<em>Sua</em></p>
        <h1 className="dr-h1 dr-b-h1">Akwaaba, Ama. Your teacher is here.</h1>
        <ol className="dr-journey" aria-label="Lesson journey">
          <li className="dr-j-on">Hear it</li><li>Try it</li><li>Check</li><li>Done</li>
        </ol>
      </div>
      <div className="dr-b-stage">
        <p className="dr-b-stage-label">Today's question</p>
        <div className="dr-stage-math dr-b-math"><MathView node={PROBLEM} /></div>
        <p className="dr-stage-sub">x plus two, all over four, equals three</p>
      </div>
      <button type="button" className="dr-primary">Begin the lesson</button>
      <button type="button" className="dr-quiet">Or play Hear the Difference first</button>
      <Dock active="home" />
    </div>
  );
}

function BLearn() {
  return (
    <div className="dr-screen dr-b">
      <div className="dr-b-hero dr-b-hero-sm">
        <p className="dr-eyebrow dr-b-eyebrow">Tie<em>Sua</em> - Learn</p>
        <ol className="dr-journey" aria-label="Lesson journey">
          <li className="dr-j-on">Hear it</li><li className="dr-j-on">Try it</li><li>Check</li><li>Done</li>
        </ol>
      </div>
      <div className="dr-b-stage">
        <p className="dr-b-stage-label">Our question</p>
        <div className="dr-stage-math dr-b-math"><MathView node={PROBLEM} /></div>
        <p className="dr-stage-sub">x plus two, all over four, equals three</p>
      </div>
      <div className="dr-thread">
        <p><span className="dr-who">TieSua</span> What operation would undo "all over four"? Say it, or type below.</p>
        <p className="dr-thread-you"><span className="dr-who">You can</span> talk - type - ask for a hint - say "speak slower"</p>
      </div>
      <TalkButton state="idle" />
      <button type="button" className="dr-quiet">Type your answer instead</button>
      <Dock active="learn" />
    </div>
  );
}

/* ---------- Hear + Settings (Direction A language) ---------- */
function HearFrame({ revealed }: { revealed?: boolean }) {
  return (
    <div className="dr-screen">
      <p className="dr-eyebrow">Tie<em>Sua</em> - Hear the Difference</p>
      <h1 className="dr-h2">{revealed ? 'Two meanings, two sounds' : 'First, just listen'}</h1>
      {!revealed ? (<>
        <p className="dr-lede">You will hear one sentence. It could mean two different questions. Listen carefully.</p>
        <div className="dr-listen-stage"><p className="dr-listen-big">"x plus two over four"</p><p className="dr-note">Spoken the ordinary way - no clues.</p></div>
        <button type="button" className="dr-primary">Play it</button>
        <button type="button" className="dr-quiet">Show me the two meanings</button>
      </>) : (<>
        <div className="dr-heard"><p className="dr-who">Meaning one</p><div className="dr-stage-math dr-inline-math"><MathView node={HEAR_A} /></div><p>"x plus two, <strong>all over</strong> four"</p><button type="button" className="dr-chip-btn">Hear meaning one</button></div>
        <div className="dr-heard"><p className="dr-who">Meaning two</p><div className="dr-stage-math dr-inline-math"><MathView node={HEAR_B} /></div><p>"x, plus <strong>two over</strong> four"</p><button type="button" className="dr-chip-btn">Hear meaning two</button></div>
        <div className="dr-chips"><button type="button">Explore the top part</button><button type="button">Explore the bottom part</button><button type="button">Play again</button></div>
        <button type="button" className="dr-primary">Now let me learn</button>
      </>)}
      <Dock active="hear" />
    </div>
  );
}

function PrefsFrame() {
  return (
    <div className="dr-screen">
      <p className="dr-eyebrow">Tie<em>Sua</em> - Settings</p>
      <h1 className="dr-h2">Make TieSua comfortable</h1>
      <p className="dr-lede">You can also change all of this just by asking - say "speak slower" or "try another voice".</p>
      <section className="dr-pref-group" aria-label="How TieSua sounds">
        <h2>How TieSua sounds</h2>
        <p><strong>Voice:</strong> Google UK English Female <button type="button" className="dr-chip-btn">Hear it</button> <button type="button" className="dr-chip-btn">Try another</button></p>
        <p><strong>Speed:</strong> Comfortable (1.15x) <button type="button" className="dr-chip-btn">Slower</button> <button type="button" className="dr-chip-btn">Faster</button></p>
        <p><strong>Pauses and volume:</strong> Natural pauses - Full volume</p>
      </section>
      <section className="dr-pref-group" aria-label="How things look">
        <h2>How things look</h2>
        <p><strong>Writing size:</strong> Large <button type="button" className="dr-chip-btn">Make bigger</button> <button type="button" className="dr-chip-btn">Make smaller</button></p>
      </section>
      <section className="dr-pref-group" aria-label="How I interact">
        <h2>How I interact</h2>
        <p><strong>Announcements:</strong> TieSua's voice <button type="button" className="dr-chip-btn">Use my screen reader instead</button></p>
        <p className="dr-note">Listening comparisons and technical tools live under "Advanced", away from everyday learning.</p>
      </section>
      <Dock active="prefs" />
    </div>
  );
}

/* ---------- Review shell ---------- */
export function DesignReview() {
  const params = new URLSearchParams(window.location.search);
  const [direction, setDirection] = useState<'A' | 'B'>(params.get('dir') === 'B' ? 'B' : 'A');
  const [frame, setFrame] = useState<Frame>((params.get('frame') as Frame) || 'ready');
  const inB = direction === 'B';
  const showFrame = () => {
    if (!inB) {
      if (frame === 'home-first') return <AHome />;
      if (frame === 'home-return') return <AHome returning />;
      if (frame === 'hear-1') return <HearFrame />;
      if (frame === 'hear-2') return <HearFrame revealed />;
      if (frame === 'prefs') return <PrefsFrame />;
      return <LearnShellA frame={frame} />;
    }
    return frame.startsWith('home') ? <BHome /> : <BLearn />;
  };
  return (
    <div className="dr-page">
      {!params.has('clean') && (<header className="dr-reviewbar">
        <p className="dr-review-title"><strong>TieSua design review</strong> - prototype only. Buttons show intended behaviour; states are simulated and labelled. Production app is unchanged (remove ?design to return).</p>
        <div className="dr-review-controls" role="group" aria-label="Design direction">
          <button type="button" aria-pressed={direction === 'A'} className={direction === 'A' ? 'dr-seg dr-seg-on' : 'dr-seg'} onClick={() => setDirection('A')}>Direction A - The Mathematical Stage (recommended)</button>
          <button type="button" aria-pressed={direction === 'B'} className={direction === 'B' ? 'dr-seg dr-seg-on' : 'dr-seg'} onClick={() => setDirection('B')}>Direction B - The Guided Lesson Room</button>
        </div>
        <div className="dr-review-controls" role="group" aria-label="Preview state">
          {FRAMES.map((f) => (
            <button key={f.id} type="button" aria-pressed={frame === f.id} className={frame === f.id ? 'dr-seg dr-seg-on' : 'dr-seg'} onClick={() => setFrame(f.id)}>{f.label}</button>
          ))}
        </div>
        {inB && <p className="dr-review-note">Direction B is shown for Home and Learn-ready; all other states use Direction A.</p>}
      </header>)}
      <main className="dr-canvas">{showFrame()}</main>
    </div>
  );
}

