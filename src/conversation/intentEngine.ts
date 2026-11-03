import { isLearnerQuestion } from '../lessons/checker';
import { validateAction, type ProposedAction } from './actions';

/** Deterministic local intent engine (stage 1). Fast, offline, and
 * conservative: in an active lesson, anything that looks like
 * mathematics reaches the verifier flow untouched. Application
 * controls are matched with synonym-tolerant patterns; combined
 * control requests are split ONLY when every clause is a known
 * control (never inside a mathematical instruction). Everything
 * unrecognised is marked for Meta interpretation or clarification —
 * never guessed. */

export type IntentResult =
  | { kind: 'actions'; actions: ProposedAction[]; destructive: boolean }
  | { kind: 'math'; text: string }
  | { kind: 'question'; text: string }
  | { kind: 'needs-interpretation'; text: string }
  | { kind: 'clarify'; text: string; choices: [string, string] };

const norm = (t: string) => t.toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim();
const temp = (t: string) => /\b(for this|just this|this time|this question|this problem|this one)\b/.test(t);

function single(t: string): ProposedAction[] | 'question' | null {
  const a = (name: ProposedAction['name'], args: Record<string, unknown> = {}, scope: 'persistent' | 'temporary' = 'persistent') =>
    [validateAction({ name, args, scope })!];
  if (/^(stop|stop speaking|be quiet|quiet)$/.test(t)) return a('speech.stop');
  if (/take me home|go home|back home/.test(t)) return a('nav.goHome');
  if (/^(?:hear|say|play)(?: it| them| the)? (?:ordinary|ordinarily|ordinary way)$/.test(t)) return a('demo.hearOrdinary');
  if (/^(?:hear|say|play)(?: it| them| the)? (?:clear|clearly|clear way)$/.test(t)) return a('demo.hearClear');
  if (/hear the difference/.test(t)) return a('nav.openHear');
  if (/(open|change|voice and display) settings|open settings/.test(t)) return a('nav.openSettings');
  if (/start (the lesson|again|over)|restart|start the lesson again/.test(t)) return a('lesson.restart');
  if (/undo (my )?(last )?(step|answer)|go back a step|undo that/.test(t)) return a('lesson.undoStep');
  if (/repeat (the )?(previous step|last step)/.test(t)) return a('speech.repeatCurrent');
  if (/explain (the )?(previous step|last step|that step|that)/.test(t)) return a('lesson.explainStep');
  if (/repeat (the )?(equation|question|problem)/.test(t) || /what was the question/.test(t) || /say (the )?(equation|question|problem) again/.test(t)) return a('speech.repeatProblem');
  if (/repeat (that|it|this)/.test(t)) return a('speech.repeatCurrent');
  if (/what have we done|recap|summary of|where (are we|did we get)/.test(t)) return a('lesson.recap');
  if (/easier (question|problem|one)/.test(t)) return a('lesson.easierProblem');
  if (/(next|harder|another) (question|problem)/.test(t)) return a('lesson.nextProblem');
  if (/^(let's )?continue$|^carry on$|^go on$/.test(t)) return a('lesson.continue');
  if (/give me a hint|^hint/.test(t)) return a('lesson.hint');
  if (/explain (the )?(numerator|denominator)/.test(t)) return a('lesson.explainPart', { part: t.includes('numerator') ? 'numerator' : 'denominator' });
  if (/(top|upper) part|number on (the )?top|top number/.test(t)) return a('lesson.explainPart', { part: 'numerator' });
  if (/bottom part|number (at|on) (the )?bottom|bottom number/.test(t)) return a('lesson.explainPart', { part: 'denominator' });
  // Voice selection: descriptors start a preview, never a blind guess.
  if (/previous voice|go back to the .*voice|that voice again/.test(t)) return a('speech.previewVoice', { direction: 'previous' });
  if (/keep this voice|keep that voice|this voice is (fine|good)/.test(t)) return a('speech.previewVoice', { direction: 'keep' });
  if (/man'?s voice|male voice|woman'?s voice|female voice|deeper|gentler|softer|harsher|harsh|another voice|different voice|try another|other voice|new voice/.test(t)) {
    const descriptor = /woman|female/.test(t) ? 'feminine-sounding' : /man|male/.test(t) ? 'masculine-sounding' : /deep/.test(t) ? 'deeper' : /soft|gentl/.test(t) ? 'softer' : 'another';
    return a('speech.previewVoice', { direction: 'descriptor', descriptor });
  }
  // Speed / pauses / volume / text size (temporary when scoped).
  const scope = temp(t) ? 'temporary' : 'persistent';
  if (/too (fast|quick)|talking too fast|you'?re rushing|rushing|slow down|speak slower|a bit slower|little slower/.test(t)) return a('speech.setRate', { delta: -0.2 }, scope);
  if (/speak faster|a bit faster|little faster|speed up|too slow/.test(t)) return a('speech.setRate', { delta: 0.2 }, scope);
  if (/don'?t pause so much|pauses? (are )?too long|shorter pauses|less pause/.test(t)) return a('speech.setPauses', { delta: -0.5 }, scope);
  if (/longer pauses|pauses? longer|more pauses?|pause (a bit )?more/.test(t)) return a('speech.setPauses', { delta: 0.5 }, scope);
  if (/louder|can'?t (quite )?hear|too quiet|speak up/.test(t)) return a('speech.setVolume', { delta: 0.2 });
  if (/quieter|too loud|lower (the )?volume/.test(t)) return a('speech.setVolume', { delta: -0.2 });
  if (/bigger (writing|text|maths|mathematics)|make .* bigger|can'?t see|larger (writing|text)|see (this|it|the mathematics) (properly|better|clearly)/.test(t)) return a('display.setTextSize', { value: 150 });
  if (/smaller (writing|text)|make .* smaller/.test(t)) return a('display.setTextSize', { value: 100 });
  if (/read (that|it|this) (slowly|in detail)|say (that|it) (slowly|again slowly)|more detail|detailed (reading|speech|mathematics)/.test(t)) return a('reading.temporaryStyle', { style: /detail/.test(t) ? 'detailed' : 'slow' });
  if (/^(why|how|what does|what is|can you explain|explain|i didn'?t understand|say it another way|what do you mean)/.test(t)) return 'question';
  return null;
}

const looksMathematical = (t: string) =>
  /^(multiply|divide|add|subtract)\b/.test(t) || /[0-9]/.test(t) && /(plus|minus|equals|over|times)/.test(t) ||
  /\b(x|equals|plus|minus|times|over|divided)\b/.test(t) && /(equals|plus|minus|times|over|divided|=)/.test(t) || /[=+*/^()0-9]/.test(t) && /\bx\b/.test(t);

export function classifyRequest(raw: string, inLesson: boolean): IntentResult {
  const text = raw.trim();
  const t = norm(text);
  if (!t) return { kind: 'clarify', text, choices: ['Say that again', 'Type it instead'] };

  // Interruption always wins, instantly and locally.
  if (/^(stop|stop speaking|be quiet)$/.test(t)) {
    return { kind: 'actions', actions: [validateAction({ name: 'speech.stop' })!], destructive: false };
  }

  // A keyword inside a refusal, conditional, or a question about an
  // action is not permission to perform it. Let the orchestrator resolve
  // the purpose, including mixed requests, using the current context.
  // "Don't pause so much" is a positive request for shorter pauses.
  if (/\b(?:do not|don't|dont|never|not|without|instead of|unless|if|whether)\b/.test(t)
      && !/^don'?t pause so much$/.test(t)) return { kind: 'needs-interpretation', text };
  if (/^(?:why|what happens|what would happen|how do i|how can i|can i|should i)\b/.test(t)) {
    return { kind: 'question', text };
  }

  // Combined controls: split only when EVERY clause is a control.
  if (/\band\b/.test(t) && !/^(multiply|divide|add|subtract)\b/.test(t)) {
    const clauses = t.split(/\s+and\s+/).map((c) => c.trim()).filter(Boolean);
    if (clauses.length > 1) {
      const all: ProposedAction[] = [];
      let ok = true;
      for (const clause of clauses) {
        const r = single(clause);
        if (Array.isArray(r)) all.push(...r); else { ok = false; break; }
      }
      if (ok && all.length > 1) {
        // Settings first, repeats last, so the repeat uses new settings.
        all.sort((x, y) => Number(x.name.startsWith('speech.repeat')) - Number(y.name.startsWith('speech.repeat')));
        return { kind: 'actions', actions: all, destructive: all.some((x) => ['lesson.restart', 'lesson.easierProblem', 'lesson.nextProblem', 'lesson.undoStep'].includes(x.name)) };
      }
    }
  }

  // Sequenced requests ("slow down for this, then back to normal")
  // must not be half-executed by a single-clause match.
  if (/\bthen\b|back to normal/.test(t)) return { kind: 'needs-interpretation', text };

  const matched = single(t);
  if (Array.isArray(matched)) {
    // Undo a "back to normal speed" sentinel into a rate restore is
    // the executor's job via persistent defaults; keep registry pure.
    const destructive = matched.some((x) => ['lesson.restart', 'lesson.easierProblem', 'lesson.nextProblem', 'lesson.undoStep'].includes(x.name));
    return { kind: 'actions', actions: matched, destructive };
  }
  if (isLearnerQuestion(text)) return { kind: 'question', text };
  if (matched === 'question' && !looksMathematical(t)) return { kind: 'question', text };
  if (inLesson && looksMathematical(t)) return { kind: 'math', text };
  if (matched === 'question') return { kind: 'question', text };
  if (looksMathematical(t)) return { kind: 'math', text };
  return { kind: 'needs-interpretation', text };
}
