import { useState } from 'react';
import { MathView } from '../components/MathView';
import { parseExpression } from '../math/parser';
import './minimal.css';

/* Minimal-direction design prototype (isolated route: /?minimal).
   Simulated states, labelled. Production app is unchanged. */

const EQ_PROBLEM = parseExpression('(x+2)/4 = 3');
const EQ_FRAC = parseExpression('x+(2/4)');
const EQ_ANSWER = parseExpression('x = 10');

type Frame = 'home' | 'home-listening' | 'lessons' | 'intro' | 'example' | 'waiting' | 'keyboard' | 'incorrect' | 'completion'
  | 'post-complete' | 'post-repeat' | 'post-next' | 'post-topic' | 'post-unavailable' | 'post-question' | 'post-stop';
const FRAMES: { id: Frame; label: string }[] = [
  { id: 'home', label: '1 Home idle' },
  { id: 'home-listening', label: '2 Home listening' },
  { id: 'lessons', label: '3 Lessons catalogue' },
  { id: 'intro', label: '4 Lesson introduction' },
  { id: 'example', label: '5 Worked example' },
  { id: 'waiting', label: '6 Waiting for response' },
  { id: 'keyboard', label: '7 Keyboard surface' },
  { id: 'incorrect', label: '8 After incorrect answer' },
  { id: 'completion', label: '9 Lesson completion' },
  { id: 'post-complete', label: '10 Completed - what next?' },
  { id: 'post-repeat', label: '11 Repeating the lesson' },
  { id: 'post-next', label: '12 Next lesson begins' },
  { id: 'post-topic', label: '13 A different topic' },
  { id: 'post-unavailable', label: '14 Unavailable lesson' },
  { id: 'post-question', label: '15 Follow-up question' },
  { id: 'post-stop', label: '16 Stopping for today' },
];

function MicIcon({ size = 40 }: { size?: number }) {
  return (<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" fill="currentColor" /></svg>);
}
function KeyboardIcon() {
  return (<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 3v2h2V8H6zm4 0v2h2V8h-2zm4 0v2h2V8h-2zm4 0v2h2V8h-2zM6 12v2h2v-2H6zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 16v2h10v-2H7z" fill="currentColor" /></svg>);
}

function Dock({ active }: { active: string }) {
  const items = [
    { id: 'home', label: 'Home', d: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z' },
    { id: 'lessons', label: 'Lessons', d: 'M12 3L2 8l10 5 10-5-10-5z M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5' },
    { id: 'explore', label: 'Explore', d: 'M4 10v4h4l5 5V5L8 10H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11' },
    { id: 'settings', label: 'Settings', d: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L14.8 3h-5.6L8.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.5 3h5.6l.5-3a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z' },
  ];
  return (
    <nav className="mn-dock" aria-label="Prototype navigation (simulated)">
      {items.map((i) => (
        <span key={i.id} className={active === i.id ? 'mn-dock-item mn-on' : 'mn-dock-item'} aria-current={active === i.id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={i.d} fill="currentColor" /></svg>{i.label}
        </span>
      ))}
    </nav>
  );
}

function VoiceCluster({ listening = false }: { listening?: boolean }) {
  return (
    <div className="mn-voice">
      <button type="button" className={listening ? 'mn-mic mn-mic-live' : 'mn-mic'} aria-label={listening ? 'Stop listening' : 'Talk to TieSua'} aria-pressed={listening}>
        <MicIcon size={44} />
      </button>
      <button type="button" className="mn-kbd" aria-label="Type instead"><KeyboardIcon /></button>
      {listening && <p className="mn-status" role="status">Listening...</p>}
    </div>
  );
}

function Wordmark() { return <p className="mn-mark">Tie<em>Sua</em></p>; }

function Home({ listening = false }: { listening?: boolean }) {
  return (
    <div className="mn-screen mn-center">
      <Wordmark />
      <h1 className="mn-ask">What would you like to learn today?</h1>
      <VoiceCluster listening={listening} />
      {listening
        ? <p className="mn-heard">"I want to learn fractions."</p>
        : <button type="button" className="mn-browse">Browse lessons</button>}
      <Dock active="home" />
    </div>
  );
}

const CATALOGUE: { level: string; topics: { topic: string; lessons: { title: string; state: 'ready' | 'soon' }[] }[] }[] = [
  { level: 'Junior High 1', topics: [
    { topic: 'Fractions', lessons: [
      { title: 'Parts of a whole: numerators and denominators', state: 'ready' },
      { title: 'Equivalent fractions', state: 'soon' },
      { title: 'Adding fractions with the same denominator', state: 'soon' },
    ]},
    { topic: 'Equations', lessons: [
      { title: 'Solving equations with a fraction', state: 'ready' },
      { title: 'One-step equations', state: 'soon' },
    ]},
  ]},
  { level: 'Junior High 2', topics: [
    { topic: 'Equations', lessons: [{ title: 'Two-step equations', state: 'soon' }] },
    { topic: 'Ratio and proportion', lessons: [{ title: 'Sharing in a ratio', state: 'soon' }] },
  ]},
];

function Lessons() {
  return (
    <div className="mn-screen">
      <Wordmark />
      <h1 className="mn-title">Lessons</h1>
      {CATALOGUE.map((lvl) => (
        <section key={lvl.level} className="mn-level" aria-label={lvl.level}>
          <h2 className="mn-level-name">{lvl.level}</h2>
          {lvl.topics.map((t) => (
            <div key={t.topic} className="mn-topic">
              <h3 className="mn-topic-name">{t.topic}</h3>
              <ul className="mn-lesson-list">
                {t.lessons.map((l) => (
                  <li key={l.title} className="mn-lesson-row">
                    <span>{l.title}</span>
                    {l.state === 'ready'
                      ? <span className="mn-ready">Start</span>
                      : <span className="mn-soon">Coming soon</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <p className="mn-fine">Two complete lessons today. The catalogue grows from here - nothing is listed as ready until it is.</p>
      <Dock active="lessons" />
    </div>
  );
}

function LessonShell({ children, stage }: { children: React.ReactNode; stage: string }) {
  return (
    <div className="mn-screen">
      <div className="mn-lesson-head">
        <Wordmark />
        <p className="mn-stage-line">Solving equations with a fraction - {stage}</p>
      </div>
      {children}
      <Dock active="lessons" />
    </div>
  );
}

function LessonFrame({ frame }: { frame: Frame }) {
  switch (frame) {
    case 'intro': return (
      <LessonShell stage="introduction">
        <div className="mn-teach">
          <p className="mn-say">Today we solve an equation where x hides inside a fraction. By the end, you will undo the fraction yourself.</p>
          <p className="mn-say">Think of it like a parcel tied with one knot. We untie the knot first, then open the parcel.</p>
        </div>
        <VoiceCluster />
      </LessonShell>
    );
    case 'example': return (
      <LessonShell stage="worked example">
        <div className="mn-math"><MathView node={EQ_PROBLEM} /></div>
        <p className="mn-caption">x plus two, all over four, equals three</p>
        <div className="mn-teach">
          <p className="mn-say">The whole of x plus two is the numerator, all over four. To free it, we multiply both sides by four. The fours cancel on the left, and three times four makes twelve on the right.</p>
        </div>
        <VoiceCluster />
      </LessonShell>
    );
    case 'waiting': return (
      <LessonShell stage="your turn">
        <div className="mn-math"><MathView node={EQ_PROBLEM} /></div>
        <p className="mn-caption">x plus two, all over four, equals three</p>
        <div className="mn-teach">
          <p className="mn-say mn-ask-line">What operation would undo "all over four"?</p>
        </div>
        <VoiceCluster />
      </LessonShell>
    );
    case 'keyboard': return (
      <LessonShell stage="your turn">
        <div className="mn-math"><MathView node={EQ_PROBLEM} /></div>
        <p className="mn-caption">x plus two, all over four, equals three</p>
        <div className="mn-teach"><p className="mn-say mn-ask-line">What operation would undo "all over four"?</p></div>
        <VoiceCluster />
        <div className="mn-sheet" role="dialog" aria-label="Type your answer (prototype)">
          <label className="mn-sheet-label" htmlFor="mn-input">Your answer</label>
          <input id="mn-input" className="mn-input" placeholder="Type here..." autoComplete="off" />
          <div className="mn-sheet-actions">
            <button type="button" className="mn-send">Send</button>
            <button type="button" className="mn-cancel">Cancel</button>
          </div>
        </div>
      </LessonShell>
    );
    case 'incorrect': return (
      <LessonShell stage="your turn">
        <div className="mn-math"><MathView node={EQ_PROBLEM} /></div>
        <p className="mn-caption">x plus two, all over four, equals three</p>
        <div className="mn-teach">
          <p className="mn-you">You said: x + 2 = 7</p>
          <p className="mn-say">Good thinking - multiplying was right. Let us check the right side together: we multiplied three by four. What does that make?</p>
        </div>
        <VoiceCluster />
      </LessonShell>
    );
    case 'completion': return (
      <LessonShell stage="complete">
        <div className="mn-math"><MathView node={EQ_ANSWER} /></div>
        <p className="mn-caption">x equals ten</p>
        <div className="mn-teach">
          <p className="mn-say">Lesson complete. You undid "all over four", then took away two - and checked every step yourself.</p>
          <p className="mn-say">Say "next lesson", or browse for something new.</p>
        </div>
        <VoiceCluster />
      </LessonShell>
    );
    default: return null;
  }
}

function PostFrame({ frame }: { frame: Frame }) {
  const content: Partial<Record<Frame, React.ReactNode>> = {
    'post-complete': (<>
      <div className="mn-math"><MathView node={EQ_ANSWER} /></div>
      <p className="mn-caption">x equals ten</p>
      <div className="mn-teach">
        <p className="mn-say">You have done well with this lesson - you can undo a fraction in an equation now.</p>
        <p className="mn-say mn-ask-line">Would you like us to practise a few more examples together, move to the next lesson, or learn something else?</p>
      </div>
    </>),
    'post-repeat': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "Let's do that again."</p>
        <p className="mn-say">Of course. We will start this lesson from the beginning, with fresh examples. Your finished lesson stays saved.</p>
      </div>
    </>),
    'post-next': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "What's next?"</p>
        <p className="mn-say">Next is Parts of a Whole, where we look inside fractions themselves. Let us begin.</p>
      </div>
    </>),
    'post-topic': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "I want to learn equations."</p>
        <p className="mn-say">Good choice. Opening Solving Equations with a Fraction - here is what we will learn.</p>
      </div>
    </>),
    'post-unavailable': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "Teach me about brackets."</p>
        <p className="mn-say">I cannot teach brackets yet - that lesson is still being made. The closest I can offer now is Solving Equations with a Fraction. Shall we do that, or choose from all the lessons?</p>
      </div>
    </>),
    'post-question': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "Actually - why did we multiply by four?"</p>
        <p className="mn-say">Because four was dividing. Multiplying undoes dividing, and doing it to both sides keeps the equation fair. When you are ready: a few more together, the next lesson, or something else?</p>
      </div>
    </>),
    'post-stop': (<>
      <div className="mn-teach">
        <p className="mn-you">You said: "That's enough for today."</p>
        <p className="mn-say">Well done today. Your lessons and your voice are saved. Akwaaba back any time - just say what you would like to learn.</p>
      </div>
    </>),
  };
  return (
    <LessonShell stage={frame === 'post-stop' ? 'finished for today' : 'lesson complete'}>
      {content[frame]}
      <VoiceCluster />
    </LessonShell>
  );
}

export function MinimalReview() {
  const params = new URLSearchParams(window.location.search);
  const [frame, setFrame] = useState<Frame>((params.get('frame') as Frame) || 'home');
  const render = () => {
    if (frame === 'home') return <Home />;
    if (frame === 'home-listening') return <Home listening />;
    if (frame === 'lessons') return <Lessons />;
    if (frame.startsWith('post-')) return <PostFrame frame={frame} />;
    return <LessonFrame frame={frame} />;
  };
  return (
    <div className="mn-page">
      {!params.has('clean') && (
        <header className="mn-bar">
          <p><strong>TieSua minimal design</strong> - prototype only, simulated states. Production app unchanged (remove ?minimal to return).</p>
          <div className="mn-chips" role="group" aria-label="Preview screen">
            {FRAMES.map((f) => (
              <button key={f.id} type="button" aria-pressed={frame === f.id} className={frame === f.id ? 'mn-chip mn-chip-on' : 'mn-chip'} onClick={() => setFrame(f.id)}>{f.label}</button>
            ))}
          </div>
        </header>
      )}
      <main className="mn-canvas">{render()}</main>
    </div>
  );
}
