import type { SpeechPlan } from './speechPlan';

/** Acoustic rendering layer. The SpeechPlan describes mathematical
 * grouping; this module turns it into natural phrase-level speech.
 * Adjacent segments merge into one utterance so the browser engine
 * speaks connected phrases ("x plus two") instead of restarting
 * synthesis for every word. A new utterance starts only at a real
 * structural boundary (grouped fraction, equation side), carrying
 * that boundary's intended pause. Inside a phrase, an operator
 * boundary becomes a comma so the voice itself makes a small,
 * natural beat — no inserted silence. */

export interface RenderedUtterance {
  text: string;
  pauseAfterMs: number;
  pitch: number;
}

export function renderUtterances(plan: SpeechPlan): RenderedUtterance[] {
  const utterances: RenderedUtterance[] = [];
  let texts: string[] = [];
  let emphasis = false;

  const flush = (pauseAfterMs: number) => {
    if (texts.length === 0) return;
    const text = texts.join(' ').replace(/\s+/g, ' ').trim();
    // The same explicit comma convention can occur inside tutor prose,
    // which arrives as one segment rather than an expression AST.
    const fractionTerm = plan.mode === 'natural' ? /\bx,\s+(?=(?:plus|minus)\s+[a-z0-9]+\s+over\s+[a-z0-9]+\b)/i.exec(text) : null;
    if (fractionTerm) {
      const split = fractionTerm.index + 1;
      utterances.push({ text: text.slice(0, split), pauseAfterMs: 600, pitch: 1 });
      utterances.push({ text: text.slice(split + 1).trim(), pauseAfterMs, pitch: emphasis ? 1.12 : 1 });
    } else utterances.push({ text, pauseAfterMs, pitch: emphasis ? 1.12 : 1 });
    texts = [];
    emphasis = false;
  };

  for (const segment of plan.segments) {
    if (segment.emphasis) emphasis = true;
    const structuralBreak = segment.boundary === 'group' || segment.boundary === 'equation';
    if (!structuralBreak && segment.boundary === 'phrase' && segment.pauseAfterMs === 0) {
      texts.push(`${segment.text},`); // connected phrase, natural comma beat
    } else {
      texts.push(segment.text);
    }
    if (segment.pauseAfterMs > 0 || structuralBreak) {
      flush(segment.pauseAfterMs);
    }
  }
  flush(0);
  if (utterances.length > 0) utterances[utterances.length - 1].pauseAfterMs = 0;
  return utterances;
}

/** The pre-improvement rendering: one utterance per segment. Kept
 * only for the owner's side-by-side listening experiment. */
export function renderLegacyUtterances(plan: SpeechPlan): RenderedUtterance[] {
  return plan.segments.map((s) => ({ text: s.text, pauseAfterMs: s.pauseAfterMs, pitch: s.emphasis ? 1.12 : 1 }));
}

export function plannedPauseTotal(plan: SpeechPlan): number {
  return plan.segments.reduce((sum, s) => sum + s.pauseAfterMs, 0);
}


/**
 * Apply the learner's chosen pause multiplier to every inserted gap.
 *
 * At zero, join the phrases into one browser utterance. Otherwise browsers
 * still add a gap each time one utterance ends and another begins, even if
 * our own timeout was zero. This avoids that preventable gap.
 *
 * A browser voice can still introduce natural timing within an utterance;
 * Web Speech does not expose exact control over its internal prosody.
 */
export function applyPauseScale(utterances: RenderedUtterance[], pauseScale: number): RenderedUtterance[] {
  const scale = Number.isFinite(pauseScale) ? Math.max(0, pauseScale) : 1;
  if (scale === 0) {
    if (utterances.length === 0) return [];
    return [{
      text: utterances.map((utterance) => utterance.text.trim()).join(' ').replace(/\s+/g, ' ').trim(),
      pauseAfterMs: 0,
      pitch: 1,
    }];
  }
  return utterances.map((utterance) => ({
    ...utterance,
    pauseAfterMs: Math.round(utterance.pauseAfterMs * scale),
  }));
}
