import { useState } from 'react';
import { parseExpression } from '../math/parser';
import { planText, toSpeechPlan, type SpeechMode } from '../speech/speechPlan';
import { plannedPauseTotal, renderLegacyUtterances, renderUtterances } from '../speech/render';
import type { useSpeech } from '../speech/useSpeech';

type Player = ReturnType<typeof useSpeech>;
const EXPRESSIONS = ['(x+2)/4', 'x+(2/4)', '3(x+2)', 'x-(-3)', '((x+2)/4)/2', '(x+2)/4 = 3'];

/** Side-by-side listening experiment: previous per-segment playback
 * vs the improved phrase-level rendering, same voice and rate (your
 * Listening settings). Kokoro remains an assessed-but-not-installed
 * candidate — no neural audio is faked here. The product owner's
 * listening decision is final; timings are device measurements of
 * the browser engine, not proof of naturalness. */
export function VoiceCompare({ player }: { player: Player }) {
  const [expr, setExpr] = useState(EXPRESSIONS[0]);
  const [mode, setMode] = useState<SpeechMode>('natural');
  const plan = toSpeechPlan(parseExpression(expr), mode);
  const improved = renderUtterances(plan);
  const legacy = renderLegacyUtterances(plan);
  return (
    <div className="step-card" aria-label="Speech listening experiment">
      <h2>Speech listening experiment</h2>
      <p>Same expression, same voice and speed — two ways of playing it. <strong>Improved</strong> speaks connected phrases with silence only at real mathematical boundaries. <strong>Previous</strong> restarts the voice for every small segment, which sounded slow and choppy.</p>
      <div className="btn-row">
        <label htmlFor="cmp-expr">Expression</label>
        <select id="cmp-expr" value={expr} onChange={(e) => setExpr(e.target.value)}>
          {EXPRESSIONS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <label htmlFor="cmp-mode">Reading</label>
        <select id="cmp-mode" value={mode} onChange={(e) => setMode(e.target.value as SpeechMode)}>
          <option value="natural">Natural</option>
          <option value="detailed">Detailed</option>
          <option value="ordinary">Ordinary (flat)</option>
        </select>
      </div>
      <p className="reading-caption">TieSua reading: “{planText(plan)}”</p>
      <div className="btn-row" role="group" aria-label="Play comparison">
        <button type="button" className="btn btn-teal" onClick={() => player.speak(plan)}>Play improved speech</button>
        <button type="button" className="btn" onClick={() => player.speakLegacy(plan)}>Play previous speech</button>
        <button type="button" className="btn" onClick={player.stop} disabled={!player.speaking}>Stop</button>
        <button type="button" className="btn" onClick={player.replay} disabled={!player.caption}>Hear again</button>
      </div>
      <p className="fineprint" aria-live="polite">
        {player.timing.totalMs !== null
          ? `Last playback (${player.renderStyle === 'legacy' ? 'previous' : 'improved'}): first sound after about ${player.timing.firstSegmentMs ?? '—'} ms; total ${player.timing.totalMs} ms including pauses. Listen and judge naturalness yourself — timing alone does not prove clarity.`
          : 'Play either version to measure first-sound and total time on this device.'}
      </p>
      <ul className="outline" aria-label="How each version will play">
        <li>Improved: {improved.length} phrase(s), {plannedPauseTotal(plan)} ms of planned grouping pauses — {improved.map((u) => `“${u.text}”`).join(' · ')}</li>
        <li>Previous: {legacy.length} separate segment(s) with a synthesis restart for each.</li>
      </ul>
      <h3>Kokoro local neural speech (not installed)</h3>
      <p className="fineprint">
        Assessed in the project voice evaluation: open-weight 82M model, Apache-licensed, CPU-capable with
        smaller ONNX variants published, but not downloaded or measured on this laptop, and its Windows
        setup needs extra tooling. It is not played or imitated here. Recommendation until a measured
        trial exists: the browser voice at a comfortable speed. No Ghanaian-accent suitability is
        claimed for any voice — clear, natural English is the criterion, and your listening decides.
      </p>
    </div>
  );
}
