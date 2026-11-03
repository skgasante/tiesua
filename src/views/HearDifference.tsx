import { useEffect, useMemo, useState } from 'react';
import { parseExpression, ParseError } from '../math/parser';
import { outline, type MathNode } from '../math/ast';
import { exploreParts, planText, toSpeechPlan, type SpeechMode } from '../speech/speechPlan';
import { MathView } from '../components/MathView';
import type { useSpeech } from '../speech/useSpeech';
import type { ReactNode } from 'react';

type Player = ReturnType<typeof useSpeech>;

const EXAMPLES: { expr: string; title: string }[] = [
  { expr: '(x+2)/4', title: 'Meaning one' },
  { expr: 'x+(2/4)', title: 'Meaning two' },
];
const EXTRA = ['3(x+2)', 'x-(-3)', '(x+2)/4 = 3'];
const SpeakerIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>;

function ExprCard({ expr, title, player }: { expr: string; title: string; player: Player }) {
  const parsed = useMemo(() => {
    try { return { node: parseExpression(expr) as MathNode, error: '' }; }
    catch (e) { return { node: null, error: e instanceof ParseError ? e.message : 'Could not read that expression.' }; }
  }, [expr]);
  if (!parsed.node) return <p role="alert">{parsed.error}</p>;
  const node = parsed.node;
  const hear = (mode: SpeechMode, slow = false) => {
    const plan = toSpeechPlan(node, mode);
    if (slow) {
      const slowed = { ...plan, segments: plan.segments.map((s) => ({ ...s, pauseAfterMs: Math.round(s.pauseAfterMs * 1.8) })) };
      player.speak(slowed);
    } else player.speak(plan);
  };
  return (
    <article className="expr-card" aria-label={title}>
      <p className="expr-title">{title}</p>
      <p className="math-display"><MathView node={node} /></p>
      <p className="expr-raw">{expr}</p>
      <div className="btn-row" role="group" aria-label={`Listen to ${expr}`}>
        <button type="button" className="btn btn-teal" onClick={() => hear('natural')}>Hear TieSua reading</button>
        <button type="button" className="btn" onClick={() => hear('natural', true)}>Hear slowly</button>
        <button type="button" className="btn" onClick={() => hear('detailed')}>Detailed reading</button>
      </div>
      <p className="reading-caption">TieSua says: “{planText(toSpeechPlan(node, 'natural'))}”</p>
      {
        <div className="parts">
          <p className="parts-heading">Explore this expression part by part:</p>
          <div className="btn-row">
            {exploreParts(node).map((part) => (
              <button key={part.nodeId + part.label} type="button" className="btn btn-small" onClick={() => player.speak(part.plan)}>
                Hear: {part.label}
              </button>
            ))}
          </div>
          <ul className="outline" aria-label="Structure of this expression">
            {outline(node).map((item, i) => (
              <li key={i} style={{ marginLeft: `${item.depth * 1.25}rem` }}>{item.label}</li>
            ))}
          </ul>
        </div>
      }
    </article>
  );
}

export function HearDifference({ player, conversationControls }: { player: Player; conversationControls?: ReactNode }) {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState<'lab' | 'more' | 'custom' | 'detail'>('lab');
  useEffect(() => { const workspace = document.getElementById('main'); if (workspace) workspace.scrollTop = 0; }, [page]);
  const hearOrdinary = () => {
    // Play both flat readings back to back through the same plan path.
    const [a, b] = EXAMPLES.map((e) => toSpeechPlan(parseExpression(e.expr), 'ordinary'));
    player.speak({ mode: 'ordinary', segments: [...a.segments, { id: 'gap', nodeId: a.segments[0].nodeId, text: 'and', pauseAfterMs: 400, boundary: 'phrase' }, ...b.segments] });
  };
  return (
    <section className="sound-lab" aria-labelledby="hear-heading">
      {page === 'lab' ? <>
      <h1 id="hear-heading">Maths Sound Lab</h1>
      <p className="sound-lab-subtitle">Listen closely. Discover how maths makes sense.</p>
      <div className="sound-lab-panel">
        <div className="sound-lab-intro"><span className="sound-lab-icon"><SpeakerIcon /></span><div><h2>Hear the Difference</h2><p>The same words can mean different things. Listen to how TieSua makes the difference clear.</p></div></div>
        <button type="button" className="sound-lab-ordinary" onClick={hearOrdinary}><SpeakerIcon />Hear the ordinary version</button>
        <div className="sound-lab-expressions">
          {EXAMPLES.map(({expr, title}) => {
            const node = parseExpression(expr);
            return <article key={expr} className="sound-lab-expression" aria-label={title}>
              <div className="sound-lab-math"><MathView node={node} /></div>
              <button type="button" className="sound-lab-hear" aria-label={`Hear ${expr}`} onClick={() => player.speak(toSpeechPlan(node, 'natural'))}><SpeakerIcon />Hear this expression</button>
            </article>;
          })}
        </div>
        <div className="sound-lab-ask"><div><h2>Ask TieSua a question</h2><p>Use the microphone or keyboard to ask about the expressions.</p></div>{conversationControls}</div>
      </div>
      <button type="button" className="upcoming-link" onClick={() => setPage('more')}>Explore more expressions</button>
      </> : page === 'more' ? <>
        <div className="sound-lab-toolbar"><button type="button" className="btn" onClick={() => setPage('lab')}>Back to Sound Lab</button>{conversationControls}</div>
        <h1 id="hear-heading">Explore more expressions</h1>
        <p className="sound-lab-subtitle">Listen to an expression, or explore its parts.</p>
        <div className="expression-list" aria-label="Expressions to explore">
          {[...EXAMPLES.map((e) => e.expr), ...EXTRA].map((expr) => <div className="expression-list-row" key={expr}>
            <div className="expression-list-math"><MathView node={parseExpression(expr)} /></div>
            <div className="expression-list-actions">
              <button type="button" className="expression-icon" aria-label={`Hear ${expr}`} title={`Hear ${expr}`} onClick={() => player.speak(toSpeechPlan(parseExpression(expr), 'natural'))}><SpeakerIcon /></button>
              <button type="button" className="expression-explore" onClick={() => { setSelected(expr); setPage('detail'); }}>Explore<span className="sr-only"> {expr}</span></button>
            </div>
          </div>)}
        </div>
        <div className="expression-navigation"><button type="button" className="btn" onClick={() => setPage('custom')}>Enter an expression</button></div>
      </> : page === 'custom' ? <div className="step-card">
        <div className="sound-lab-toolbar"><button type="button" className="btn" onClick={() => setPage('more')}>Back to expressions</button>{conversationControls}</div>
        <h1 id="hear-heading">Enter an expression</h1>
        <form className="custom-form" onSubmit={(ev) => { ev.preventDefault(); if (custom.trim()) { setSelected(custom.trim()); setPage('detail'); } }}>
          <label htmlFor="custom-expr">Or type your own expression (for example 3(x+2))</label>
          <div className="btn-row">
            <input id="custom-expr" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. (x+2)/4" autoComplete="off" />
            <button type="submit" className="btn btn-teal">Show it</button>
          </div>
        </form>
      </div> : <div>
        <div className="sound-lab-toolbar"><button type="button" className="btn" onClick={() => setPage('more')}>Back to expressions</button>{conversationControls}</div>
        <h1 id="hear-heading">Explore an expression</h1>
        <ExprCard expr={selected} title="Selected expression" player={player} />
      </div>}
    </section>
  );
}
