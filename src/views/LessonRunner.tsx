import { voiceReturn } from '../conversation/voiceReturn';
import { responsePrompt } from '../conversation/responsePrompt';
import { voiceCandidates } from '../speech/voiceCandidates';
import { StepConversation } from '../lessons/stepConversation';
import { equationOpening } from '../lessons/opening';
import { BOX_STORY_START, PREVIOUS_TEACHING_TITLES } from '../lessons/equationJourney';
import { executeSharedAction, changesLearningState, normalizeTurnActions, DEPARTURE_ACTIONS } from '../conversation/actionExecutor';
import { interpretVoicePreview, voicePreviewPrompt } from '../conversation/voicePreview';
import { TIESUA_GUIDE } from '../conversation/guide';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MathView } from '../components/MathView';
import { parseExpression } from '../math/parser';
import { exploreParts, planText, toSpeechPlan, type SpeechPlan } from '../speech/speechPlan';
import { api, tutorSourceLabel, type StepResult, type VerifiedState } from '../learn/api';
import { recognitionSupported } from '../speech/recognition';
import type { ConversationFacade } from '../App';
import { PROBLEMS } from '../learn/problems';
import { workingDisplay } from '../learn/workingDisplay';
import { validateAction, availableActions, type ProposedAction } from '../conversation/actions';
import { previewInput, recordTurn } from '../conversation/decisionTrace';
import { canExecuteMove, isTeachingMove, type TeachingMove } from '../conversation/teachingMoves';
import { catalogueContext, getLesson, nextReadyLesson, resolveLessonQuery, type LessonDef } from '../lessons/catalogue';
import { clearPendingChoice, pendingChoiceContext, resolvePendingAction, setPendingChoice as storePendingChoice } from '../conversation/pendingChoice';
import { type LessonStage } from '../lessons/intent';
import { checkFractionItem, equationSubmission, extractNumber, interpretNumericAnswer, isLearnerQuestion } from '../lessons/checker';
import { getPrerequisite, type Prerequisite } from '../lessons/prerequisites';
import { SILENCE_INTERVALS_SECONDS, followUpForStep, silenceArmed, speechIsRecent } from '../lessons/silence';
import { deriveContinuation, teachingFollowUp, isGenericClarification, isSpeechRepairNotice, requestsThinkingTime } from '../conversation/turnContract';
import { logLifecycle } from '../speech/lifecycleLog';
import { StopSpeakingButton } from '../components/GlobalConversation';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '../lessons/resume';
import type { Progress } from '../lessons/progress';
import type { SpeechSettings, useSpeech } from '../speech/useSpeech';
import '../design/minimal.css';

type Player = ReturnType<typeof useSpeech>;
type NavView = 'home' | 'lessons' | 'lesson' | 'explore' | 'settings';
const fractionExpression = (prompt: string): string | null => {
  const match = prompt.match(/\b(\w+) over (\w+)\b/i);
  const numerator = match ? extractNumber(match[1]) : null;
  const denominator = match ? extractNumber(match[2]) : null;
  return numerator !== null && denominator !== null ? `${numerator}/${denominator}` : null;
};
const textPlan = (text: string): SpeechPlan => ({ mode: 'natural', segments: [{ id: 'c', nodeId: 'c', text, pauseAfterMs: 0, boundary: 'none' }] });

interface Props {
  active?: boolean;
  lessonId: string;
  player: Player;
  settings: SpeechSettings;
  onSettingsPatch: (patch: Partial<SpeechSettings>) => void;
  voices: { name: string; lang: string; uri: string }[];
  onNavigate: (view: NavView) => void;
  onOpenLesson: (id: string) => void;
  onLearnerText?: (text: string) => void;
  onCompleteLesson: (id: string) => void;
  onActivity: (id: string) => void;
  progress: Progress;
  conversation: ConversationFacade;
}

const CHOICE_QUESTION = 'We have finished this example. You can ask me any questions, practise together, or try one on your own. What would you like to do?';

export function LessonRunner({ active = true, lessonId, player, settings, onSettingsPatch, voices, onNavigate, onOpenLesson, onLearnerText, onCompleteLesson, onActivity, progress, conversation }: Props) {
  const lesson = getLesson(lessonId) ?? getLesson('equations-fraction')!;
  const [stage, setStage] = useState<LessonStage>('intro');
  const exampleStep = useRef(0);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewRef = useRef<number | null>(null);
  const reviewStep = (index: number) => {
    turnEpoch.current += 1;
    player.stop();
    const next = Math.max(0, Math.min(index, exampleStep.current));
    logLifecycle('lesson.review', `step ${next}; frontier ${exampleStep.current}`);
    reviewRef.current = next < exampleStep.current ? next : null;
    setReviewIndex(reviewRef.current);
    const prompt = lesson.example.steps?.[next].explanation ?? '';
    say((reviewRef.current !== null ? 'Let us revisit this step. ' : 'Back at your current step. ') + prompt);
  };
  const stepConversation = useRef(new StepConversation());
  const clarificationCount = useRef(0);
  const turnInputMode = useRef<'speech' | 'typed'>('speech');
  const [sayText, setSayText] = useState('');
  type Recovery = { retry: () => Promise<unknown>; resume: boolean; text: string };
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const recoveryRef = useRef<Recovery | null>(null);
  const retryResume = useRef(false);
  const activeRef = useRef(active); activeRef.current = active;

  const [mathExpr, setMathExpr] = useState<string | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [itemSet, setItemSet] = useState<'guided' | 'extra' | 'independent'>('guided');
  const [attempts, setAttempts] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentProblemId, setCurrentProblemId] = useState<string | null>(null);
  const usedProblems = useRef<Set<string>>(new Set());
  const guidedStarted = useRef(false);
  const [eqState, setEqState] = useState<VerifiedState | null>(null);
  const [support, setSupport] = useState<'guided' | 'independent'>('guided');
  const [wrongSteps, setWrongSteps] = useState(0);
  const [extraIndex, setExtraIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const pendingOrchestration = useRef(0);
  const [sheet, setSheet] = useState(false);
  const [input, setInput] = useState('');
  const [confirming, setConfirming] = useState<{ actions: ProposedAction[]; label: string } | null>(null);
  const [preview, setPreview] = useState<{ candidates: { name: string; uri: string }[]; index: number; returnPrompt: string; originalVoice: string } | null>(null);

  const temporarySpeech = useRef<Partial<SpeechSettings>>({});
  const tempRate = useRef<number | null>(null);
  // Learning-context stack: a prerequisite detour keeps the
  // original lesson state (stage, item, equation) untouched below.
  const prereqRef = useRef<{ prereq: Prerequisite; attempts: number } | null>(null);
  // Hands-free conversation (opt-in, experimental audio path).
  const autoListenFailures = useRef(0);
  const silenceStep = useRef(0);
  const [quietThinking, setQuietThinking] = useState(false);
  const lastSpeechAt = useRef(0);
  const speakingRef = useRef(false);
  speakingRef.current = player.speaking;
  const speechPlayerRef = useRef(player); speechPlayerRef.current = player;
  /** Wait until current speech finishes (bounded), so the next
   * teaching sentence never cuts off the previous one. */
  const waitForSpeechEnd = useCallback((maxMs = 120000) => new Promise<void>((resolve) => {
    if (!speechPlayerRef.current.isSpeaking()) { resolve(); return; }
    const started = Date.now();
    const iv = window.setInterval(() => {
      if (!speechPlayerRef.current.isSpeaking() || Date.now() - started > maxMs) { window.clearInterval(iv); resolve(); }
    }, 250);
  }), []);
  const voiceSupported = recognitionSupported();
  const inputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const stageRef = useRef(stage); stageRef.current = stage;
  const lastVerificationRef = useRef<Record<string, unknown> | null>(null);
  const needsResync = useRef(false);
  const eqRef = useRef(eqState); eqRef.current = eqState;
  const lessonRef = useRef(lesson); lessonRef.current = lesson;
  type OrchestrateStatus = 'handled' | 'unavailable' | 'clarified';
  const orchestrateTurnRef = useRef<(text: string, extra?: Record<string, unknown>, begin?: boolean) => Promise<OrchestrateStatus>>(async () => 'unavailable');

  // Current conversation only (never accumulated, never
  // persisted): what TieSua is saying now, and the learner's most
  // recent utterance exactly as recognition returned it - replaced
  // by the next utterance. Interpretations stay in dev diagnostics.
  const [lastLearner, setLastLearner] = useState('');
  const [livePartial, setLivePartial] = useState('');
  const currentQuestionRef = useRef('');
  const sayRef = useRef('');
  const mainPromptRef = useRef(sayText); mainPromptRef.current = sayText;
  // Controls and waiting notices are speech/captions, not lesson content.
  const notice = useCallback((text: string, voiceURI?: string) => {
    sayRef.current = text;
    const once = temporarySpeech.current; temporarySpeech.current = {};
    player.speak(textPlan(text), false, { ...once, ...(voiceURI ? { voiceURI } : {}) });
    conversation.lessonReady();
  }, [player, conversation]);
  const resumeControl = (text: string, voiceURI?: string) => {
    const question = mainPromptRef.current.match(/[^.!?]*\?/g)?.at(-1)?.trim();
    notice(question ? `${text} Back to our question. ${question}` : `${text} You can ask a question or tell me what you would like to do next.`, voiceURI);
  };
  const modelReply = (text: string) => responsePrompt(text, stageRef.current === 'example' ? lessonRef.current.example.steps?.[reviewRef.current ?? exampleStep.current]?.explanation ?? mainPromptRef.current : currentQuestionRef.current || mainPromptRef.current);
  const say = useCallback((text: string, rateOverride?: number) => {
    if (isSpeechRepairNotice(text)) { notice(text); return; }
    if (/what is(?: the)?(?: value of)? x\b|what does x equal/i.test(text)) currentQuestionRef.current = text;
    sayRef.current = text; setSayText(text);
    const once = temporarySpeech.current; temporarySpeech.current = {};
    player.speak(textPlan(text), false, { ...once, ...(rateOverride ? { rate: rateOverride } : {}) });
    conversation.lessonReady();
  }, [player, conversation, notice]);
  const serviceFailure = (text: string, retry: () => Promise<unknown>, reason = 'unavailable') => {
    const saved = { text, retry, resume: conversation.enabled || retryResume.current };
    recoveryRef.current = saved; setRecovery(saved);
    setQuietThinking(true);
    logLifecycle('service.paused', reason);
    // A failed service request is not a new lesson question.
    player.speak(textPlan('I could not get a response. Your place is kept. Would you like me to try your last request again? Say retry, or take a break. The retry button is also available.'));
  };
  const retryFailedTurn = async () => {
    const saved = recoveryRef.current;
    if (!saved) return;
    recoveryRef.current = null; setRecovery(null);
    retryResume.current = saved.resume;
    setQuietThinking(false);
    try {
      await saved.retry();
      if (!recoveryRef.current && mounted.current && activeRef.current && saved.resume && !conversation.enabled) conversation.toggle();
    } finally { retryResume.current = false; }
  };
  const captionFor = useCallback((expr: string) => {
    try { const p = toSpeechPlan(parseExpression(expr), 'natural'); return p.segments.map((s) => s.text + (s.pauseAfterMs >= 150 ? ',' : '')).join(' ').replace(/\s+/g, ' ').trim(); }
    catch { return expr; }
  }, []);
  const advanceReview = (feedback = '') => {
    if (reviewRef.current === null) return;
    const next = Math.min(reviewRef.current + 1, exampleStep.current);
    reviewRef.current = next < exampleStep.current ? next : null;
    setReviewIndex(reviewRef.current);
    logLifecycle('lesson.review-next', `step ${next}; frontier ${exampleStep.current}`);
    say(`${feedback}${lessonRef.current.example.steps![next].explanation}`);
  };
  const hearExpression = useCallback((expr: string, detailed = false) => {
    try {
      const plan = toSpeechPlan(parseExpression(expr), detailed ? 'detailed' : 'natural');
      const rate = tempRate.current ?? undefined; tempRate.current = null;
      const question = mainPromptRef.current.match(/[^.!?]*\?/g)?.at(-1)?.trim();
      player.speak(question ? { ...plan, segments: [...plan.segments, ...textPlan(question).segments] } : plan, false, rate ? { rate } : {});
    } catch { say(expr); }
  }, [player, say]);

  // ---------------- lesson flow ----------------
  const completionLine = useCallback((l: LessonDef) => {
    const next = nextReadyLesson(l.id);
    return next
      ? `You have done well with this lesson. ${l.recap} You can still ask me questions about anything we covered. Would you like us to practise a few more examples together, move to the next lesson, or learn something else?`
      : `You have done well with this lesson. ${l.recap} You can still ask me questions about anything we covered. Would you like us to practise a few more examples together, or learn something else?`;
  }, []);

  const finishLesson = useCallback(() => {
    onCompleteLesson(lessonRef.current.id);
    stageRef.current = 'complete';
    setStage('complete');
    const epoch = turnEpoch.current;
    void (async () => {
      const l = lessonRef.current;
      const st = await orchestrateTurnRef.current('I have finished the lesson.', {
        verified_result: { verdict: 'lesson-complete', lesson: l.title, recap: l.recap },
      });
      if (!mounted.current || epoch !== turnEpoch.current) return;
      if (st === 'handled') await waitForSpeechEnd();
      if (!mounted.current || epoch !== turnEpoch.current || stageRef.current !== 'complete') return;
      const next = nextReadyLesson(l.id);
      const question = completionLine(l);
      storePendingChoice([
        { id: 'guided', title: 'practise more together', action: { name: 'lesson.morePractice', args: { mode: 'guided' } } },
        ...(next ? [{ id: next.id, title: 'move to the next lesson', action: { name: 'lesson.nextLesson' as const, args: {} } }] : []),
        { id: 'browse', title: 'learn something else', action: { name: 'nav.openLessons', args: {} } },
      ], question);
      currentQuestionRef.current = question;
      say(question);
    })();
  }, [onCompleteLesson, say, completionLine, waitForSpeechEnd]);

  const askChoice = useCallback((acknowledgement = '') => {
    stageRef.current = 'choice';
    setStage('choice');
    storePendingChoice([
      { id: 'guided', title: 'practise together', action: { name: 'lesson.morePractice', args: { mode: 'guided' } } },
      { id: 'independent', title: 'try one on your own', action: { name: 'lesson.morePractice', args: { mode: 'independent' } } },
    ], CHOICE_QUESTION);
    currentQuestionRef.current = CHOICE_QUESTION;
    say(acknowledgement + CHOICE_QUESTION);
  }, [say]);

  const presentFractionItem = useCallback((set: 'guided' | 'extra' | 'independent', index: number) => {
    const l = lessonRef.current;
    const items = set === 'guided' ? l.guidedItems ?? [] : set === 'extra' ? l.guidedExtraItems ?? [] : l.independentItems ?? [];
    const item = items[index];
    if (!item) return;
    if (set === 'guided') guidedStarted.current = true;
    setItemSet(set); setItemIndex(index); setAttempts(0);
    setMathExpr(fractionExpression(item.prompt));
    currentQuestionRef.current = item.prompt;
    say(item.prompt);
  }, [say]);

  const startEquationProblem = useCallback(async (problemId: string, mode: 'guided' | 'independent', announce?: string) => {
    const problem = PROBLEMS.find((p) => p.id === problemId) ?? PROBLEMS[0];
    usedProblems.current.add(problemId);
    setCurrentProblemId(problemId);
    setBusy(true); setWrongSteps(0); setSupport(mode);
    const epoch = turnEpoch.current;
    try {
      const created = await api.createSession(problem.expression);
      if (!mounted.current || epoch !== turnEpoch.current) return;
      needsResync.current = false;
      eqRef.current = created.state;
      lastVerificationRef.current = { verdict: 'incomplete', solved: false, equation_now: created.state.equation_text };
      currentQuestionRef.current = 'What step will you try first?';
      setSessionId(created.session_id); setEqState(created.state);
      setMathExpr(problem.expression);
      setStage(mode);
      say(announce ?? (mode === 'guided'
        ? `Now let's try a different equation together. ${captionFor(problem.expression)}. What step will you try first?`
        : `Now it is your turn to try a different equation on your own. ${captionFor(problem.expression)}. Tell me your first step. You can ask for a hint anytime.`));
    } catch {
      if (!mounted.current || epoch !== turnEpoch.current) return;
      serviceFailure(problem.expression, () => startEquationProblem(problemId, mode, announce), 'create-session');
    } finally { setBusy(false); }
  }, [say, captionFor]);

  const startLesson = useCallback(() => {
    const l = lessonRef.current;
    usedProblems.current.clear(); guidedStarted.current = false;
    onActivity(l.id);
    needsResync.current = false; lastVerificationRef.current = null; eqRef.current = null; stageRef.current = 'intro'; exampleStep.current = 0;
    setStage('intro'); setSayText(l.intro.join(' ')); recoveryRef.current = null; setRecovery(null); setEqState(null); setSessionId(null); setCurrentProblemId(null); setItemIndex(0); setExtraIndex(0); clearPendingChoice();
    setMathExpr(null);
    // A one-shot temporary rate from Home ("explain everything
    // slowly") applies to this introduction only, then is gone.
    let onceRate: number | undefined;
    try {
      const tr = sessionStorage.getItem('tiesua-temp-rate');
      if (tr) { sessionStorage.removeItem('tiesua-temp-rate'); const v = Number(tr); if (v >= 0.6 && v <= 2.5) onceRate = v; }
    } catch { /* storage unavailable */ }
    // AI-first lesson opening: the orchestrator introduces the
    // lesson in its own words, grounded in the checked content.
    // Only when live AI is unavailable do we read the lesson's own
    // introduction - and we say plainly that live help is off.
    void (async () => {
      const st = await orchestrateTurnRef.current('Begin this lesson and introduce the idea simply.', { opening: progress.completed[l.id] ? 'repeat' : 'new', opening_brief: l.intro.join(' ') }, true);
      if (st !== 'handled') {
        say(st === 'unavailable'
          ? `My live teaching help is not connected just now, so here is the lesson in its own words. ${l.title}. ${l.intro.join(' ')}`
          : `${l.intro.join(' ')}`, onceRate);
      }
    })();
  }, [say, onActivity, progress]);

  const turnEpoch = useRef(0);
  const mounted = useRef(true);
  const wasActive = useRef(active);
  useEffect(() => {
    if (!active) {
      turnEpoch.current += 1;
      setBusy(false); setOrchestrating(false);
    } else if (!wasActive.current) {
      // Orient an audio-first learner without changing the retained lesson text.
      if (sayText) player.speak(textPlan('Back to your lesson. ' + sayText));
      conversation.lessonReady();
    }
    wasActive.current = active;
  }, [active]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const initializedLesson = useRef<string | null>(null);

  // Restore an unfinished lesson after refresh. Equation sessions
  // live in backend RAM and are never assumed restorable: the
  // current question restarts under a fresh session, honestly.
  useEffect(() => {
    if (initializedLesson.current === lessonId) return;
    initializedLesson.current = lessonId;
    const snap = loadSnapshot(lessonId);
    const l = lessonRef.current;
    if (snap && snap.stage !== 'intro' && snap.stage !== 'complete') {
      if (l.kind === 'fractions' && (snap.stage === 'guided' || snap.stage === 'independent')) {
        setStage(snap.stage);
        say('Welcome once again. Let us pick up where we left off.');
        window.setTimeout(() => presentFractionItem(snap.itemSet, snap.itemIndex), 30);
        return;
      }
      if (l.kind === 'fractions' && snap.stage === 'choice') { askChoice(); return; }
      if (l.kind === 'equations' && snap.problemId) {
        void (async () => {
          if (snap.sessionId) {
            try {
              const restored = await api.getSession(snap.sessionId);
              if (!mounted.current || initializedLesson.current !== lessonId) return;
              eqRef.current = restored.state; setEqState(restored.state); setSessionId(snap.sessionId);
              setCurrentProblemId(snap.problemId); setSupport(snap.support); usedProblems.current.add(snap.problemId!);
              if (restored.state.solved) {
                setMathExpr(restored.state.equation_text);
                if (snap.stage === 'choice') { askChoice(); return; }
                finishLesson(); return;
              }
              stageRef.current = snap.support; setStage(snap.support); setMathExpr(workingDisplay(restored.state));
              const task = restored.state.pending_operation ? 'What equation do you get after that operation?' : 'What would you like to try next?';
              currentQuestionRef.current = task;
              say(`Welcome once again. Your equation is ${captionFor(restored.state.equation_text)}. ${task}`);
              return;
            } catch { /* session no longer exists; restart honestly */ }
          }
          if (!mounted.current || initializedLesson.current !== lessonId) return;
          await startEquationProblem(snap.problemId!, snap.support,
            'Welcome once again. I cannot recover the earlier checking, so we will start this question again.');
        })();
        return;
      }
      if (snap.stage === 'example' || snap.stage === 'example-check') {
        const steps = l.example.steps;
        const compatible = l.id !== 'equations-fraction' || (snap.exampleVersion === 2 || snap.exampleVersion === 3 || snap.exampleVersion === 4);
        const index = compatible && Number.isInteger(snap.exampleStep) ? Math.max(0, Math.min(snap.exampleVersion === 4 ? snap.exampleStep! : Math.max(0, steps!.findIndex(step => step.title === PREVIOUS_TEACHING_TITLES[snap.exampleStep! + (snap.exampleVersion === 2 && snap.exampleStep! >= 7 ? 3 : 0)])), (steps?.length ?? 1) - 1)) : 0;
        stageRef.current = 'example'; setStage('example'); exampleStep.current = index;
        setMathExpr(steps?.[index].expression ?? l.example.expression);
        const explanation = steps?.[index].explanation ?? `${l.example.explanation.join(' ')} Would you like to continue, or do you have a question?`;
        currentQuestionRef.current = explanation;
        say(`${compatible ? 'Welcome once again.' : 'Welcome once again. This lesson has changed, so we will begin the new example together.'} ${explanation}`);
        return;
      }
    }
    startLesson();
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage === 'complete') { clearSnapshot(lessonId); return; }
    if (stage === 'intro') return;
    saveSnapshot({ lessonId, stage, itemSet, itemIndex, support, problemId: currentProblemId, sessionId, exampleStep: exampleStep.current, exampleVersion: 4, savedAt: new Date().toISOString() });
  }, [lessonId, stage, itemSet, itemIndex, support, currentProblemId, sessionId, sayText]);

  const advance = useCallback((acknowledgement = '') => {
    const l = lessonRef.current;
    if (stageRef.current === 'intro') {
      stageRef.current = 'example';
      setStage('example');
      if (l.example.steps?.length) {
        exampleStep.current = 0;
        logLifecycle('lesson.step', 'intro -> step 0');
        setMathExpr(l.example.steps[0].expression);
        currentQuestionRef.current = l.example.steps[0].explanation;
        say(`${acknowledgement}${l.example.steps[0].explanation}`);
        return;
      }
      say('This teaching step is unavailable. Please restart the lesson.');
      return;
    }
    if (stageRef.current === 'example') {
      const steps = l.example.steps;
      if (steps && exampleStep.current < steps.length - 1) {
        exampleStep.current += 1;
        logLifecycle('lesson.step', `advance -> step ${exampleStep.current}`);
        const step = steps[exampleStep.current];
        setMathExpr(step.expression);
        currentQuestionRef.current = step.explanation;
        say(`${acknowledgement}${step.explanation}`);
        return;
      }
      if (steps) {
        const feedback = steps[exampleStep.current].successFeedback;
        askChoice(feedback ? feedback + ' ' : acknowledgement || 'That is right. '); return;
      }
      askChoice();
    }
  }, [say, askChoice]);

  // ---------------- fractions practice ----------------
  const handleFractionAnswer = useCallback(async (text: string) => {
    const l = lessonRef.current;
    const items = itemSet === 'guided' ? l.guidedItems ?? [] : itemSet === 'extra' ? l.guidedExtraItems ?? [] : l.independentItems ?? [];
    const item = items[itemIndex];
    if (!item) return;
    const verdict = checkFractionItem(item.answer, text);
    recordTurn({
      screen: 'lesson', lessonId: lessonRef.current.id, stage: stageRef.current,
      ...previewInput(text), interpretedBy: 'none', metaCalled: false,
      decision: verdict === null ? 'fraction-answer-not-a-number' : verdict ? 'fraction-answer-correct' : 'fraction-answer-wrong',
      actionsExecuted: [], replyOrigin: 'verifier',
      verification: { involved: verdict !== null },
      nextStateChosenBy: verdict ? 'fixed-transition' : 'none',
    });
    if (verdict === null) { say(`Say or type just the number. ${item.prompt}`); return; }
    if (verdict === false) {
      setAttempts((a) => a + 1);
      // The checker owns the verdict; Meta chooses how to teach
      // from it (its grounded teach text is in context). The
      // item's own checked teach line is the honest fallback.
      const st = await orchestrateTurnRef.current(text, {
        verified_result: { verdict: 'wrong', practice_prompt: item.prompt, teach: item.teach },
      });
      if (st !== 'handled') say(`${item.teach} Try again: ${item.prompt}`);
      return;
    }
    const nextIndex = itemIndex + 1;
    if (itemSet === 'independent') {
      if (nextIndex < items.length) { currentQuestionRef.current = items[nextIndex].prompt; setMathExpr(fractionExpression(items[nextIndex].prompt)); say(`Correct. ${items[nextIndex].prompt}`); setItemIndex(nextIndex); setAttempts(0); }
      else finishLesson();
      return;
    }
    if (nextIndex < items.length) { currentQuestionRef.current = items[nextIndex].prompt; setMathExpr(fractionExpression(items[nextIndex].prompt)); say(`Correct. ${items[nextIndex].prompt}`); setItemIndex(nextIndex); setAttempts(0); }
    else askChoice();
  }, [itemSet, itemIndex, say, askChoice, finishLesson]);

  // ---------------- equations practice (verifier-backed) ----------------
  const askTutor = useCallback(async (question?: string, silent = false) => {
    if (!sessionId) return '';
    try {
      const t = await api.tutor(sessionId, question);
      recordTurn({
        screen: 'lesson', lessonId: lessonRef.current.id, stage: stageRef.current,
        ...previewInput(question ?? '(after a checked step)'), interpretedBy: 'meta',
        metaCalled: t.source === 'live-meta' || (t.model !== null && t.diagnostics?.note !== 'meta budget exhausted'),
        decision: 'equations-tutor-feedback', actionsExecuted: [],
        replyOrigin: t.source, verification: { involved: true },
        nextStateChosenBy: 'verifier',
      });
      if (!silent) say(modelReply(t.text));
      return t.text;
    } catch { return ''; }
  }, [sessionId, say]);

  const submitMath = useCallback(async (value: string) => {
    if (!sessionId) return;
    if (busy) { notice('I am still checking your previous step. Please wait a moment, then try again.'); return; }
    setBusy(true);
    const epoch = turnEpoch.current;
    try {
      if (needsResync.current) {
        const recovered = await api.getSession(sessionId);
        if (!mounted.current || epoch !== turnEpoch.current) return;
        needsResync.current = false;
        eqRef.current = recovered.state; setEqState(recovered.state); setMathExpr(workingDisplay(recovered.state));
        lastVerificationRef.current = { verdict: recovered.state.solved ? 'solved' : 'incomplete', solved: recovered.state.solved, equation_now: recovered.state.equation_text };
        if (recovered.state.solved) {
          say('I checked your work again. Your answer is complete.');
          await waitForSpeechEnd();
          if (!mounted.current || epoch !== turnEpoch.current) return;
          if (support === 'independent') finishLesson(); else askChoice();
        } else say(`I found your current equation: ${captionFor(recovered.state.equation_text)}. Please try your step again.`);
        return;
      }
      const result: StepResult = await api.submitStep(sessionId, equationSubmission(value, currentQuestionRef.current));
      if (!mounted.current) return;
      if (epoch !== turnEpoch.current) { needsResync.current = true; return; }
      recordTurn({
        screen: 'lesson', lessonId: lessonRef.current.id, stage: stageRef.current,
        ...previewInput(value), interpretedBy: 'local', metaCalled: false,
        decision: `verifier-${result.action_type}`, actionsExecuted: [],
        replyOrigin: 'verifier',
        verification: { involved: true, verdict: result.verdict, actionType: result.action_type },
        nextStateChosenBy: 'verifier', nextStage: result.state.solved ? (support === 'independent' ? 'complete' : 'choice') : undefined,
      });
      lastVerificationRef.current = { verdict: result.verdict, ...result.verified_facts, action_type: result.action_type, solved: result.state.solved, equation_now: result.state.equation_text };
      eqRef.current = result.state;
      setEqState(result.state);
      if (result.state.equation_text) setMathExpr(workingDisplay(result.state));
      // Questions and navigation words are conversational, not
      // mathematics: the orchestrator decides what they mean.
      if (result.action_type === 'navigation' || result.action_type === 'question'
          || (result.action_type === 'incomplete_input' && result.verdict !== 'invalid')) {
        // An unparsed turn may be conversation ("I am lost"), not a
        // wrong mathematical step. Give the model the verifier's result;
        // lesson gates still prevent unverified changes or skipped work.
        const st = await orchestrateTurnRef.current(value, {
          verified_result: { verdict: result.verdict, action_type: result.action_type, solved: result.state.solved,
            pending_operation: result.state.pending_operation, equation_now: result.state.equation_text },
        });
        if (st === 'unavailable') notice('My live teaching help is not connected just now. Your equation has not changed.');
        return;
      }
      if (result.verdict === 'invalid' || result.verdict === 'unsupported') {
        setWrongSteps((w) => w + 1);
        say(result.message);
        // After a verified mistake, Meta chooses the teaching move
        // (different explanation, hint, guided support...) from the
        // verified facts - it never changes the verdict itself.
        await orchestrateTurnRef.current(value, {
          verified_result: { verdict: result.verdict, action_type: result.action_type, ...result.verified_facts, solved: result.state.solved, pending_operation: result.state.pending_operation, error_category: result.error_category, equation_now: result.state.equation_text },
        });
        return;
      }
      say(result.action_type === 'operation' && result.verdict === 'valid'
        ? `${result.message} Written out, that is ${captionFor(workingDisplay(result.state))}.`
        : result.message);
      if (result.state.solved) {
        // The full solution is verified (x reached, set complete).
        // Completion itself is curriculum authority; how we close -
        // check understanding, offer practice or another lesson -
        // is Meta's teaching choice.
        if (support === 'independent') finishLesson();
        else {
          const st = await orchestrateTurnRef.current(value, {
            verified_result: { verdict: 'solved', equation_now: result.state.equation_text },
          });
          if (st === 'handled') await waitForSpeechEnd();
          askChoice();
        }
        return;
      }
      // After every other verified response, Meta chooses the next
      // teaching move from the verified state.
      await orchestrateTurnRef.current(value, {
        verified_result: { verdict: result.verdict, action_type: result.action_type, ...result.verified_facts, solved: result.state.solved, pending_operation: result.state.pending_operation, error_category: result.error_category, equation_now: result.state.equation_text },
      });
    } catch {
      if (!mounted.current) return;
      needsResync.current = true;
      if (epoch !== turnEpoch.current) return;
      serviceFailure(value, () => submitMath(value), 'verify-step');
    } finally { setBusy(false); }
  }, [sessionId, busy, say, support, askChoice, finishLesson, waitForSpeechEnd, captionFor]);

  // ---------------- voices (preview, never guessed) ----------------
  const speakSample = useCallback((voice: { name: string; uri: string }, index: number, total: number) => {
    player.speak(textPlan(voicePreviewPrompt(index, total)), false, { voiceURI: voice.uri });
  }, [player]);
  const startPreview = useCallback((descriptor?: string) => {
    const candidates = voiceCandidates(voices, descriptor);
    if (!candidates.length) { notice('I could not find a matching voice in this browser. Your current voice will stay.'); return; }
    setPreview({ candidates, index: 0, returnPrompt: mainPromptRef.current, originalVoice: settingsRef.current.voiceURI });
    speakSample(candidates[0], 0, candidates.length);
  }, [voices, notice, speakSample]);

  // ---------------- lesson opening (executor lookup only) ----------------
  /** Executes an AI-chosen lesson.openLesson: finds the catalogue
   * lesson for the orchestrator's query. It never decides what the
   * learner meant; an ambiguous lookup becomes a spoken question
   * whose answer the orchestrator resolves next turn. */
  const routeTopic = useCallback((query: string) => {
    const res = resolveLessonQuery(query);
    if (res.kind === 'open') {
      if (res.lesson.id === lessonRef.current.id) { say(`We are learning ${res.lesson.title} right now - let us keep going.`); return; }
      clearPendingChoice();
      say(`Opening ${res.lesson.title}.`);
      onOpenLesson(res.lesson.id);
      return;
    }
    if (res.kind === 'ambiguous') {
      const question = `I have ${res.options.map((m) => `${m.title} - ${m.clarifyHint}`).join('. ')}. Which sounds right?`;
      storePendingChoice(res.options, question); setStage('awaiting-topic');
      say(question);
      return;
    }
    say(`I cannot teach ${query} here. The available lesson is Solving Equations with a Fraction.`);
  }, [onOpenLesson, say]);

  const morePractice = useCallback((mode: 'guided' | 'independent') => {
    const l = lessonRef.current;
    if (l.kind === 'fractions') {
      clearPendingChoice();
      if (mode === 'guided') {
        if (!guidedStarted.current) { setStage('guided'); presentFractionItem('guided', 0); }
        else if (itemSet !== 'extra') { setStage('guided'); presentFractionItem('extra', 0); }
        else { askChoice(); }
      } else { setStage('independent'); presentFractionItem('independent', 0); }
      return;
    }
    const pool = [...(mode === 'guided' ? [l.guidedProblemId!] : []), l.independentProblemId!, ...(l.extraProblemIds ?? [])];
    const fresh = pool.filter((id) => !usedProblems.current.has(id));
    if (!fresh.length) {
      // Never dress up a repeated question as new practice.
      const question = 'That is all the new practice questions I have for this lesson just now. Would you like to repeat this lesson, or choose another topic?';
      storePendingChoice([
        { id: 'repeat', title: 'repeat this lesson', action: { name: 'lesson.repeatLesson', args: {} } },
        { id: 'browse', title: 'choose another topic', action: { name: 'nav.openLessons', args: {} } },
      ], question);
      say(question);
      return;
    }
    clearPendingChoice();
    void startEquationProblem(fresh[0], mode);
    setExtraIndex((i) => i + 1);
  }, [itemSet, extraIndex, presentFractionItem, say, startEquationProblem, askChoice]);

  // ---------------- action execution (registry only) ----------------
  const executeActions = useCallback(async (actions: ProposedAction[]): Promise<void> => {
    const s = settingsRef.current;
    for (const action of actions) {
      const common = executeSharedAction(action, {
        settings: s, patch: onSettingsPatch,
        temporary: (patch) => { temporarySpeech.current = { ...temporarySpeech.current, ...patch }; },
        navigate: onNavigate, stop: () => player.stop(), endConversation: () => conversation.end(), waitForLearner: () => setQuietThinking(true), guide: () => say(TIESUA_GUIDE), demonstrate: (plan) => player.speak(plan),
      });
      if (common) {
        if (common.message) notice(common.message);
        if (action.name === 'conversation.end' || action.name === 'conversation.wait' || action.name === 'help.guide') return;
        continue;
      }
      switch (action.name) {
        case 'speech.previewVoice': {
          if (action.args.direction === 'previous') {
            const hist: string[] = JSON.parse(localStorage.getItem('tiesua-voice-history') ?? '[]');
            const prev = hist.pop();
            if (prev) { onSettingsPatch({ voiceURI: prev }); localStorage.setItem('tiesua-voice-history', JSON.stringify(hist)); notice('Back to your previous voice.'); }
            else notice('There is no previous voice saved yet.');
          } else if (action.args.direction === 'keep') notice('There is no voice being previewed right now. Your current voice has not changed.');
          else startPreview(typeof action.args.descriptor === 'string' ? action.args.descriptor : undefined);
          break;
        }
        case 'speech.repeatCurrent': { notice(mainPromptRef.current); break; }
        case 'speech.repeatProblem': {
          const expr = mathExpr ?? lessonRef.current.example.expression;
          hearExpression(expr); break;
        }
        case 'lesson.explainPart': {
          if (lessonRef.current.kind === 'fractions' && ['guided', 'independent'].includes(stageRef.current)) {
            const lesson = lessonRef.current;
            const items = itemSet === 'independent' ? lesson.independentItems : itemSet === 'extra' ? lesson.guidedExtraItems : lesson.guidedItems;
            const item = items?.[itemIndex];
            if (item) { say(`${item.teach} ${item.prompt}`); break; }
          }
          const expr = mathExpr ?? lessonRef.current.example.expression;
          try {
            const parts = exploreParts(parseExpression(expr));
            const wanted = String(action.args.part);
            const part = parts.find((p) => p.label.toLowerCase().includes(wanted));
            if (part) { player.speak(part.plan); setSayText(part.label); }
            else say(`I cannot identify that part in the current expression. Would you like me to read the whole expression again?`);
          } catch { say('Let us take the whole expression together first.'); }
          break;
        }
        case 'lesson.hint': case 'lesson.explainStep': {
          if (lessonRef.current.kind === 'equations' && sessionId) void askTutor(action.name === 'lesson.hint' ? 'Give me a hint' : 'Explain that step');
          else if (stageRef.current === 'example' && lessonRef.current.example.steps) say(lessonRef.current.example.steps[exampleStep.current].explanation);
          else say(lessonRef.current.example.explanation.join(' '));
          break;
        }
        case 'lesson.recap': {
          const current = eqRef.current;
          if (current && !current.solved) {
            const task = current.pending_operation ? 'You have chosen an operation. Tell me the equation you get, or ask for help.' : 'You can suggest a step, ask for a hint, or repeat the question.';
            say(`We are working together on ${lessonRef.current.title}. The current equation is ${captionFor(current.equation_text)}. ${task}`);
          } else if (currentQuestionRef.current && ['guided', 'independent'].includes(stageRef.current)) {
            say(`We are in ${lessonRef.current.title}. ${currentQuestionRef.current} You can answer, ask for help, or hear it again.`);
          } else if (stageRef.current === 'example' && lessonRef.current.example.steps) {
            say(`We are going through the example in ${lessonRef.current.title}. ${lessonRef.current.example.steps[exampleStep.current].explanation}`);
          } else say(`${lessonRef.current.title}. ${lessonRef.current.recap}`);
          break;
        }
        case 'lesson.continue': advance(); break;
        case 'lesson.undoStep': {
          if (sessionId) {
            try { const r = await api.undo(sessionId); eqRef.current = r.state; lastVerificationRef.current = { verdict: r.verdict, solved: r.state.solved, equation_now: r.state.equation_text };
              if (!r.state.solved) { clearPendingChoice(); stageRef.current = support; setStage(support); }
              setEqState(r.state); setMathExpr(workingDisplay(r.state)); say(r.message); }
            catch { say('I could not go back just now. Your equation has not changed.'); }
          } else say('We are not in the middle of an equation just now.');
          break;
        }
        case 'lesson.repeatLesson': say('Starting this lesson again, with fresh examples. Your finished work stays saved.'); startLesson(); break;
        case 'lesson.nextLesson': {
          const next = nextReadyLesson(lessonRef.current.id);
          if (next) { say(`Next is ${next.title}. Let us begin.`); onOpenLesson(next.id); }
          else say('That was the last lesson I have ready just now. You can practise more here, or learn something else - fractions, perhaps?');
          break;
        }
        case 'lesson.morePractice': morePractice(action.args.mode === 'independent' ? 'independent' : 'guided'); break;
        case 'lesson.openLesson': routeTopic(String(action.args.query ?? '')); break;
        case 'lesson.restart': setConfirming({ actions: [action], label: 'restart the lesson' }); say('Just to check: start this lesson over? Say yes, or no to stay.'); break;
        case 'lesson.easierProblem': case 'lesson.nextProblem': morePractice('guided'); break;
        case 'reading.temporaryStyle': {
          const expr = mathExpr ?? lessonRef.current.example.expression;
          const style = String(action.args.style);
          if (style.includes('slow')) tempRate.current = Math.max(0.6, settingsRef.current.rate * 0.7);
          hearExpression(expr, style.includes('detailed'));
          break;
        }
        default: break;
      }
    }
  }, [player, onSettingsPatch, say, startPreview, hearExpression, mathExpr, sessionId, askTutor, advance, startLesson, morePractice, routeTopic, onNavigate, onOpenLesson, support, itemSet, itemIndex, conversation, captionFor]);

  // ---------------- AI teaching moves (engine-gated) ----------------
  const executeTeachingMove = useCallback((move: TeachingMove) => {
    const l = lessonRef.current;
    if (l.id === 'equations-fraction' && stageRef.current === 'example'
      && ['explain-differently', 'hint', 'revisit-part', 'recap', 'explain-prerequisite'].includes(move)) {
      // Keep a missing model explanation on the current idea. Never substitute
      // the old whole-lesson paragraph or enter an unrelated prerequisite.
      say(`Let us stay with this question. ${l.example.steps![exampleStep.current].explanation}`);
      return;
    }
    switch (move) {
      case 'explain-differently': say(l.simpler.join(' ')); break;
      case 'ask-check':
        if (l.id === 'equations-fraction' && stageRef.current === 'example') {
          say(l.example.steps![exampleStep.current].explanation);
          break;
        }
        break;
      case 'guided-example': morePractice('guided'); break;
      case 'independent-practice': morePractice('independent'); break;
      case 'hint': void executeActions([{ name: 'lesson.hint', args: {} }]); break;
      case 'continue': advance(); break;
      case 'revisit-part': say(l.example.steps && stageRef.current === 'example' ? l.example.steps[exampleStep.current].explanation : l.example.explanation.join(' ')); break;
      case 'recap': say(l.recap); break;
      case 'explain-prerequisite': {
        // Only checked prerequisite content exists (multiplication).
        // The detour is pushed onto the learning-context stack; the
        // original problem waits exactly as it was.
        const prereq = getPrerequisite('multiplication');
        if (prereq && !prereqRef.current) {
          prereqRef.current = { prereq, attempts: 0 };
          say(`${prereq.explanation.join(' ')} ${prereq.check.prompt}`);
        } else say(l.simpler.join(' '));
        break;
      }
      default: break;
    }
  }, [say, morePractice, executeActions, advance]);

  /** Return from a prerequisite detour to the untouched problem. */
  const returnToProblem = useCallback(() => {
    const l = lessonRef.current;
    if (l.kind === 'fractions' && (stageRef.current === 'guided' || stageRef.current === 'independent')) {
      presentFractionItem(stageRef.current === 'guided' ? itemSet : 'independent', itemIndex);
      return;
    }
    const expr = eqRef.current?.equation_text ?? mathExpr ?? l.example.expression;
    const question = eqRef.current?.pending_operation
      ? 'What equation do you get after doing that to both sides?'
      : 'What would you like to try next?';
    say(`Our equation is still ${captionFor(expr)}. ${question}`);
  }, [presentFractionItem, itemSet, itemIndex, mathExpr, say, captionFor]);

  const handlePrereqAnswer = useCallback((text: string) => {
    const active = prereqRef.current;
    if (!active) return;
    const { prereq } = active;
    const verdict = checkFractionItem(prereq.check.answer, text);
    if (verdict === null) { say(`Just the number is fine. ${prereq.check.prompt}`); return; }
    if (verdict === true) {
      prereqRef.current = null;
      say(`That's it. ${prereq.check.teach} Now, back to where we were.`);
      const epoch = turnEpoch.current;
      const generation = player.generation();
      void waitForSpeechEnd().then(() => {
        if (mounted.current && epoch === turnEpoch.current && player.generation() === generation) returnToProblem();
      });
      return;
    }
    active.attempts += 1;
    if (active.attempts < 2) { say(`${prereq.simpler.join(' ')} ${prereq.check.prompt}`); return; }
    prereqRef.current = null;
    say(`${prereq.check.teach} Now, back to where we were.`);
    const epoch = turnEpoch.current;
    const generation = player.generation();
    void waitForSpeechEnd().then(() => {
      if (mounted.current && epoch === turnEpoch.current && player.generation() === generation) returnToProblem();
    });
  }, [say, returnToProblem, waitForSpeechEnd, player]);

  /** THE decision path for every meaningful learner turn: ONE
   * orchestrator decision (validated actions + teaching move +
   * reply). Deterministic code only executes, gates and verifies -
   * it never interprets what the learner meant. */
  const orchestrateTurn = useCallback(async (text: string, extra: Record<string, unknown> = {}, begin = false): Promise<OrchestrateStatus> => {
    const l = lessonRef.current;
    const epoch = turnEpoch.current;
    const discussionKey = l.id + ':' + stageRef.current + ':' + (reviewRef.current ?? exampleStep.current);
    const retainedDiscussion = stepConversation.current.context(discussionKey);
    const discussion = stageRef.current === 'example' ? retainedDiscussion : undefined;
    let result: Awaited<ReturnType<typeof api.orchestrate>>;
    pendingOrchestration.current++;
    setOrchestrating(true);
    try {
      result = await api.orchestrate(text, {
        screen: 'lesson', lesson: l.id, title: l.title, input_mode: turnInputMode.current,
        objective: stageRef.current === 'example' ? l.example.steps?.[reviewRef.current ?? exampleStep.current].guidance : l.objective,
        step_conversation: discussion,
        stage: stageRef.current, last_question: sayRef.current, current_question: reviewRef.current !== null ? l.example.steps?.[reviewRef.current].explanation : currentQuestionRef.current,
        reviewing: reviewRef.current !== null,
        teaching_step: stageRef.current === 'example' && l.id === 'equations-fraction' && l.example.steps ? {
          question: l.example.steps[reviewRef.current ?? exampleStep.current].explanation,
          guidance: l.example.steps[reviewRef.current ?? exampleStep.current].guidance,
          scenario: (reviewRef.current ?? exampleStep.current) < BOX_STORY_START
            ? 'Only the original sharing story has been introduced: four friends get three sweets each. The missing quantity is the total before sharing. No sweets have been added. Do not introduce adding sweets or a box.'
            : 'The new box story has been introduced: start with x sweets, add two, share the whole amount among four friends, three each.',
        } : undefined,
        equation: reviewRef.current !== null ? l.example.steps?.[reviewRef.current].expression ?? '' : eqRef.current?.equation_text ?? mathExpr ?? '',
        // Checked lesson content the reply must stay grounded in -
        // the model rephrases this, it does not invent mathematics.
        lesson_content: (stageRef.current === 'example' && l.example.steps
          ? [...l.intro, ...l.example.steps.slice(0, (reviewRef.current ?? exampleStep.current) + 1).map(step => step.explanation)]
          : [...l.intro, ...l.example.explanation, ...l.simpler]).join(' ').slice(0, 1500),
        verified_result: reviewRef.current !== null ? { equation_now: l.example.steps?.[reviewRef.current].expression ?? '', solved: false, reviewing: true } : lastVerificationRef.current ?? (stageRef.current === 'example' && l.example.steps
          ? { equation_now: l.example.steps[exampleStep.current].expression, solved: false }
          : null),
        pending_operation: eqRef.current?.pending_operation ?? null,
        completed_example: ['choice', 'complete'].includes(stageRef.current) ? {
          original_equation: l.example.expression,
          recent_steps: l.example.steps?.slice(-3).map(step => ({ equation: step.expression, explanation: step.explanation })),
          practice_equation: eqRef.current?.equation_text ?? null,
        } : undefined,
        pending_options: pendingChoiceContext(),
        catalogue: catalogueContext(),
        learning_stack: prereqRef.current ? [prereqRef.current.prereq.topic] : [],
        available_prerequisites: ['multiplication'],
        attempts, wrong_steps: wrongSteps,
        has_example_check: false,
        available_lessons: ['equations-fraction'],
        available_actions: availableActions('lesson'),
        settings: { rate: settingsRef.current.rate, pauseScale: settingsRef.current.pauseScale, volume: settingsRef.current.volume, textSize: settingsRef.current.textSize },
        ...extra,
      });
    } catch {
      if (mounted.current && epoch === turnEpoch.current && requestsThinkingTime(text)) {
        setQuietThinking(true); notice('Of course. Take your time. I will wait until you are ready.'); return 'handled';
      }
      if (mounted.current && epoch === turnEpoch.current) {
        serviceFailure(text, () => orchestrateTurnRef.current(text, extra, begin), 'request-failed');
      }
      return 'handled';
    }
    finally { pendingOrchestration.current--; if (mounted.current) setOrchestrating(pendingOrchestration.current > 0); }
    if (!mounted.current || epoch !== turnEpoch.current) return 'handled';
    if (result.source === 'unavailable' || /(?:Error|Timeout)$/.test(result.diagnostics?.note ?? '')) {
      serviceFailure(text, () => orchestrateTurnRef.current(text, extra, begin), result.diagnostics?.note ?? result.source);
      return 'handled';
    }
    if (discussion && (result.source === 'live-meta' || result.source === 'mock')) {
      const answer = !isLearnerQuestion(text) && !requestsThinkingTime(text)
        && !/\b(?:continue|move on|go ahead|next step)\b/i.test(text);
      // Repeated incomplete assessments need a different teaching approach,
      // never automatic success or the same endless checklist.
      if (answer && discussion.answers_without_progress === 2 && result.stepAssessment !== 'correct'
          && !(result.actions ?? []).length) {
        result.reply = 'I may be misunderstanding your answer. Would you like to explain it another way, or revisit this step together?';
        result.teachingMove = 'none';
      }
      stepConversation.current.record(discussionKey, text, result.reply ?? result.clarification ?? '', result.stepAssessment ?? null, answer);
    }
    logLifecycle('ai.plan', JSON.stringify({ source: result.source, assessment: result.stepAssessment, move: result.teachingMove, actions: result.actions?.map(action => action.name) }));
    const live = result.source === 'live-meta' || result.source === 'mock';
    const preferenceNames = ['speech.setRate', 'speech.setPauses', 'speech.setVolume', 'display.setTextSize'];
    const preferenceProposals = live ? (result.actions ?? []).map(validateAction) : [];
    const normalizedPreferences = preferenceProposals.every(Boolean) ? normalizeTurnActions(preferenceProposals.filter((a): a is ProposedAction => a !== null)) : null;
    const preferences = normalizedPreferences?.filter(a => preferenceNames.includes(a.name)) ?? [];
    const preferenceMessages: string[] = [];
    for (const action of preferences) {
      const outcome = executeSharedAction(action, {
        settings: settingsRef.current,
        patch: patch => {
          settingsRef.current = { ...settingsRef.current, ...patch };
          onSettingsPatch(patch);
          // The very next utterance uses the change before React rerenders.
          temporarySpeech.current = { ...temporarySpeech.current, ...patch };
        },
        temporary: patch => { temporarySpeech.current = { ...temporarySpeech.current, ...patch }; },
        navigate: onNavigate, stop: () => player.stop(),
      });
      if (outcome?.message) preferenceMessages.push(outcome.message);
    }
    if (preferences.length) result.actions = (result.actions ?? []).filter(a => !preferenceNames.includes(a.name));
    const preferenceFeedback = preferenceMessages.length ? preferenceMessages.join(' ') + ' ' : '';
    const acknowledgedAdvance = (feedback: string) => advance(feedback + preferenceFeedback);
    if (preferences.length && !(result.actions ?? []).length && (result.teachingMove ?? 'none') === 'none'
        && !['correct', 'incorrect', 'partial'].includes(result.stepAssessment ?? '')) {
      resumeControl(preferenceFeedback.trim()); return 'handled';
    }
    const controlOnly = live && (result.actions ?? []).length > 0
      && (result.actions ?? []).every(a => a.name.startsWith('speech.') || a.name.startsWith('display.') || a.name === 'conversation.wait');
    if (controlOnly && !['correct', 'incorrect', 'partial'].includes(result.stepAssessment ?? '')) {
      await executeActions((result.actions ?? []).map(a => validateAction(a)).filter((a): a is ProposedAction => a !== null));
      return 'handled';
    }
    const reviewAction = (result.source === 'live-meta' || result.source === 'mock') && result.actions?.length === 1 ? result.actions[0].name : null;
    if (reviewAction && ['lesson.reviewPrevious', 'lesson.reviewNext', 'lesson.returnCurrent'].includes(reviewAction)) {
      if (stageRef.current !== 'example') { say('Review is available during the teaching steps. Your current question is unchanged.'); return 'handled'; }
      const at = reviewRef.current ?? exampleStep.current;
      reviewStep(reviewAction === 'lesson.returnCurrent' ? exampleStep.current : at + (reviewAction === 'lesson.reviewPrevious' ? -1 : 1));
      return 'handled';
    }
    if (reviewRef.current !== null) {
      if (result.stepAssessment === 'correct' && l.example.steps![reviewRef.current].numericAnswer === undefined
        && (!isLearnerQuestion(text) || preferences.length > 0) && !/\b(?:continue|move on|next step)\b/i.test(text)) {
        advanceReview('That is right. ' + preferenceFeedback);
        return 'handled';
      }
      say(modelReply(result.reply || result.clarification || 'What would you like me to explain about this part?'));
      return 'handled';
    }
    if (stageRef.current === 'example' && l.id === 'equations-fraction' && result.teachingMove === 'ask-check') {
      say(l.example.steps![exampleStep.current].explanation);
      return 'handled';
    }
    // A question about a possible departure is not itself permission to
    // leave, even when a model proposes navigation. Likewise, a refusal
    // must not become an affirmative action.
    if (/\b(?:do not|don't|dont|never)\s+(?:take me|send me|go|switch|leave|move|return)\b/i.test(text)) {
      say('Okay, we will stay here. What would you like help with?'); return 'handled';
    }
    if (/^(?:what|how|why)\b.*\bif\b.*\b(?:home|leave|switch(?:ed|ing)?|go back)\b/i.test(text)) {
      say('If you choose to leave, this question remains unfinished. You can return while its checking session is available. Would you like to stay here or leave?');
      return 'handled';
    }
    if (requestsThinkingTime(text)) {
      // A request for thinking time never authorizes another teaching move.
      setQuietThinking(true);
      notice('Of course. Take your time. I will wait until you are ready.');
      return 'handled';
    }
    if (result.reply && /\b(?:we (?:will|'ll|can) stop here|the conversation (?:is|has) stopped|the microphone is off)\b/i.test(result.reply)
        && !(result.actions ?? []).some(action => action.name === 'conversation.end')) {
      result.reply = 'I have not stopped the conversation yet. Would you like me to turn the microphone off?';
    }
    const repairPrompt = [
      "I didn't quite catch that. Could you please say it again?",
      "I didn't hear that clearly. Could you say that again, please?",
      "I didn't quite get that. Could you come again?",
    ][clarificationCount.current % 3];
    if (repairPrompt) {
      if (isGenericClarification(result.reply ?? '') || isGenericClarification(result.clarification ?? '') || result.source === 'clarification') clarificationCount.current += 1;
      if (result.reply && isGenericClarification(result.reply)) result.reply = repairPrompt;
      if (result.clarification && isGenericClarification(result.clarification)) result.clarification = repairPrompt;
      if (result.source === 'clarification' && stageRef.current === 'example') result.clarification = repairPrompt;
    }
    if (live && stageRef.current === 'example' && l.example.steps?.[exampleStep.current]?.numericAnswer === undefined
      && result.stepAssessment === 'correct' && (!text.includes('?') && !/^(?:why|how|what|could|can|would|should)\b|\b(?:asking|my question|confused|explain|help me|don.t understand|do not understand)\b/i.test(text.trim()) || preferences.length > 0)
      && !(result.actions ?? []).some(action => action.name !== 'lesson.continue')
      && !/\b(?:continue|move on|go ahead|next step)\b/i.test(text)) {
      acknowledgedAdvance(result.reply && /^(?:yes|correct|exactly|that is right|well done|you have got)/i.test(result.reply) && result.reply.split(/\s+/).length <= 8 && !result.reply.includes('?') ? result.reply + ' ' : 'That is right. ');
      return 'handled';
    }
    if (live && !(result.actions ?? []).length && /(?:find|change|switch|try).{0,30}voice|speak (?:more slowly|faster)/i.test(result.reply ?? '') && !['correct', 'incorrect', 'partial'].includes(result.stepAssessment ?? '')) {
      notice('I have not changed that setting. Please ask again, or change it in Settings.'); return 'handled';
    }
    // An incomplete model plan must not strand a learner after a statement.
    // Without assessed understanding we retain the step and its real question.
    if (live && stageRef.current === 'example' && result.reply
        && !result.reply.includes('?') && !(result.actions ?? []).length) {
      const prompt = l.example.steps?.[exampleStep.current]?.explanation ?? currentQuestionRef.current;
      const question = prompt.match(/[^.!?]*\?/g)?.at(-1)?.trim();
      if (question) {
        result.reply = result.reply.trim() + ' ' + question;
        logLifecycle('continuation.repaired', 'Restored current teaching question after statement-only reply');
      }
    }
    const expected = stageRef.current === 'example' ? l.example.steps?.[exampleStep.current]?.numericAnswer : undefined;
    const inferred = result.interpretedAnswer;
    if (live && expected !== undefined && inferred?.purpose === 'answer' && inferred.confidence >= 0.9
      && Number.isFinite(inferred.value) && (!isLearnerQuestion(text) || preferences.length > 0)
      && (extra.verified_result as { verdict?: string } | undefined)?.verdict !== 'invalid') {
      if (inferred.value === expected) acknowledgedAdvance(`Yes, ${inferred.value}. `);
      else say(modelReply(`I understood ${inferred.value}. Let us try that calculation again.`));
      return 'handled';
    }
    if (preferenceFeedback) result.reply = preferenceFeedback + (result.reply ?? '');
    const unfinished = (l.kind === 'equations' && Boolean(eqRef.current) && !eqRef.current?.solved)
      || (l.kind === 'fractions' && ['guided', 'independent'].includes(stageRef.current));
    const valid = live ? (result.actions ?? []).map((a) => validateAction(a)).filter((a): a is ProposedAction => a !== null) : [];
    // Preserve the model's explanation. Only add a grounded invitation when
    // it has no action or question and explicitly leaves teaching to continue.
    if (result.reply && result.continuation === 'teach-next' && !(result.actions ?? []).length
        && ['none', 'explain-differently', 'hint', 'revisit-part', 'recap'].includes(result.teachingMove ?? 'none')
        && !result.reply.trim().endsWith('?')) {
      const verified = extra.verified_result as { action_type?: string } | undefined;
      const question = teachingFollowUp({ stage: stageRef.current, pendingOperation: eqRef.current?.pending_operation,
        currentQuestion: currentQuestionRef.current, actionType: verified?.action_type });
      if (question) result.reply = `${result.reply} ${question}`;
    }
    const move: TeachingMove = isTeachingMove(result.teachingMove) ? result.teachingMove : 'none';
    const gate = canExecuteMove(move, {
      stage: stageRef.current, hasExampleCheck: false,
      exampleCheckDone: false,
      inPractice: stageRef.current === 'guided' || stageRef.current === 'independent',
      sessionUnsolved: unfinished,
    });
    recordTurn({
      screen: 'lesson', lessonId: l.id, stage: stageRef.current,
      ...previewInput(text), interpretedBy: live ? 'meta' : 'none', metaCalled: result.source === 'live-meta',
      decision: `orchestrator-${result.source}`, actionsExecuted: valid.map((a) => a.name),
      replyOrigin: result.source === 'live-meta' ? 'live-meta' : result.source === 'mock' ? 'mock' : 'none',
      verification: { involved: Boolean(extra.verified_result) },
      nextStateChosenBy: valid.length || (move !== 'none' && gate.ok) ? 'meta-proposal' : 'none',
    });
    if (!live) {
      if (result.clarification) { notice(result.clarification); return 'clarified'; }
      return 'unavailable';
    }
    const completion = (extra.verified_result as { verdict?: unknown } | undefined)?.verdict === 'lesson-complete';
    if (completion) {
      // A completion response may acknowledge the accomplishment, but only
      // the learner can choose a new activity after hearing the options.
      await waitForSpeechEnd();
      if (!mounted.current || epoch !== turnEpoch.current) return 'handled';
      if (result.reply) { say(result.reply); return 'handled'; }
      return 'clarified';
    }
    if (begin) {
      // Lesson opening: only the introduction reply is spoken;
      // progression waits for the learner.
      if (l.kind === 'equations') { say(equationOpening(result.reply, l.intro.join(' '))); return 'handled'; }
      if (result.reply) { say(modelReply(result.reply)); return 'handled'; }
      return 'clarified';
    }
    // A question after a closing invitation does not authorize a new activity.
    const requestsPractice = result.learnerPurpose === 'request';
    if (['choice', 'complete'].includes(stageRef.current) && isLearnerQuestion(text) && !requestsPractice
        && !valid.some(action => action.name.startsWith('speech.') || action.name.startsWith('display.') || action.name === 'conversation.wait')) {
      await waitForSpeechEnd();
      if (!mounted.current || epoch !== turnEpoch.current) return 'handled';
      say(modelReply(result.reply || result.clarification || 'Of course. What would you like me to explain?'));
      return 'handled';
    }
    // Serialise speech: never cut off the sentence still playing
    // (for example the verifier's feedback) with this turn's reply.
    await waitForSpeechEnd();
    if (!mounted.current || epoch !== turnEpoch.current) return 'handled';
    if (valid.length !== (result.actions ?? []).length) {
      say('I could not carry out that request. Your current work is still here.');
      return 'clarified';
    }
    const proposed = normalizeTurnActions(valid);
    if (!proposed) { say('I heard more than one change of activity. Which would you like to do first?'); return 'clarified'; }
    const departures = unfinished ? proposed.filter(a => DEPARTURE_ACTIONS.has(a.name)) : [];
    if (departures.length) {
      const departure = departures[0];
      // "continue" is not a request to leave unfinished work.
      if (departure.name === 'lesson.continue') {
        say('This question is still unfinished. Would you like a hint, or to hear it again?');
        return 'clarified';
      }
      let label = 'leave this question';
      if (departure.name === 'lesson.openLesson') {
        const resolution = resolveLessonQuery(String(departure.args.query ?? ''));
        if (resolution.kind !== 'open') { say('I could not identify an available lesson. Which lesson would you like?'); return 'clarified'; }
        if (resolution.lesson.id === l.id) { say(`We are already learning ${l.title}. Would you like help with this question?`); return 'clarified'; }
        label = `leave this question unfinished and switch to ${resolution.lesson.title}`;
      } else if (departure.name === 'nav.goHome') label = 'leave this question unfinished and go Home';
      else if (departure.name === 'lesson.restart' || departure.name === 'lesson.repeatLesson') label = 'leave this question unfinished and restart this lesson';
      else if (departure.name === 'lesson.morePractice' || departure.name === 'lesson.nextProblem' || departure.name === 'lesson.easierProblem') label = 'leave this question unfinished and try another problem';
      else if (departure.name === 'nav.openHear') label = 'leave this question unfinished and open Hear the Difference';
      else if (departure.name === 'nav.openLessons' || departure.name === 'nav.openLearn') label = 'leave this question unfinished and open the lessons';
      setConfirming({ actions: proposed, label });
      say(`Just to check: would you like to ${label}? You can say yes, or no to stay here.`);
      return 'handled';
    }
    // A model can propose practice while the learner is merely ready to
    // begin. The worked example has not happened yet: start it instead of
    // offering "another" example or jumping straight to practice.
    const proposesPractice = ['guided-example', 'independent-practice'].includes(move)
      || valid.some(a => ['lesson.morePractice', 'lesson.nextProblem', 'lesson.easierProblem'].includes(a.name));
    const proposesAdvance = proposesPractice || move === 'continue' || valid.some(a => a.name === 'lesson.continue');
    if (stageRef.current === 'example' && l.example.steps && isLearnerQuestion(text) && proposesAdvance) {
      say(modelReply(result.reply || 'Let us stay on this step. What would you like me to explain?'));
      return 'handled';
    }
    if (stageRef.current === 'example' && l.example.steps && proposesAdvance) {
      if (l.id === 'equations-fraction') {
        const current = l.example.steps[exampleStep.current];
        if ((extra.verified_result as { verdict?: string } | undefined)?.verdict === 'invalid') {
          say(modelReply(result.reply || l.example.steps[exampleStep.current].explanation));
          return 'handled';
        }
        if (current.numericAnswer !== undefined || /\b(?:continue|move on|go ahead|next step|ready)\b/i.test(text) || /^(?:yes|yeah|okay|ok|sure)[.! ]*$/i.test(text.trim())) {
          say(current.explanation);
        } else if (result.reply && (/\?/.test(result.reply) || /\b(?:stay|try again|not quite|count again)\b/i.test(result.reply))) {
          say(modelReply(result.reply));
        } else {
          const acknowledgement = result.stepAssessment === 'correct' ? 'That is right. ' : result.reply && result.reply.split(/\s+/).length <= 8 ? result.reply + ' ' : 'That is right. ';
          acknowledgedAdvance(acknowledgement);
        }
        return 'handled';
      }
      // One learner turn advances one worked step. A plan may encode the
      // same intention as both an action and a move; never execute both,
      // and never offer a new activity midway through this example.
      if (/\b(?:continue|ready|yes|yeah|sure|let'?s|go ahead|next|(?:I )?(?:got it|understand)(?: now)?)\b/i.test(text) && !/\b(?:not|don't|do not|but)\b/i.test(text)) {
        const understands = /\b(?:understand|got it|makes sense)\b/i.test(text);
        const openings = ['All right, let us continue. ', 'Good, let us take the next step. ', 'Okay, let us carry on. '];
        advance(understands ? 'I am glad that is clearer. Let us continue. ' : openings[exampleStep.current % openings.length]);
      }
      else say('We are still working through this example. Would you like to continue this step, or ask a question?');
      return 'handled';
    }
    if (stageRef.current === 'intro' && proposesAdvance && !isLearnerQuestion(text)) {
      if (/\b(?:ready|continue|begin|start|go ahead|let'?s go|yes|yeah|sure)\b/i.test(text)) advance('All right, let us begin together. ');
      else say('We can go through the first example together. Say continue when you are ready, or ask me a question.');
      return 'handled';
    }
    if (valid.length !== (result.actions ?? []).length) {
      say('We are still on the current question. Would you like help with this step, or do you want to leave this question?');
      return 'clarified';
    }
    let acted = false;
    const normalized = normalizeTurnActions(valid);
    if (!normalized) {
      say('I heard more than one change of activity. Which would you like to do first?');
      return 'clarified';
    }
    if (normalized.some(action => action.name === 'conversation.end' || action.name === 'conversation.wait' || action.name === 'help.guide')) {
      await executeActions(normalized.filter(action => action.name === 'conversation.end' || action.name === 'conversation.wait' || action.name === 'help.guide').slice(0, 1));
      return 'handled';
    }
    // Gate before mutations. A rejected move must not run its companion
    // actions first and only then tell the learner it was refused.
    if (move !== 'none' && !gate.ok && !normalized.some(changesLearningState)) {
      if (['guided', 'independent'].includes(stageRef.current) && extra.verified_result) {
        // Refuse the state change, not the useful feedback. The verifier has
        // already applied (or rejected) this step. A model's ask-check or
        // continue label must not erase its explanation or strand practice.
        const question = teachingFollowUp({ stage: stageRef.current,
          pendingOperation: eqRef.current?.pending_operation,
          currentQuestion: currentQuestionRef.current,
          actionType: (extra.verified_result as { action_type?: string }).action_type });
        const feedback = result.reply?.trim();
        say(modelReply(feedback
          ? feedback + (!feedback.includes('?') && question ? ` ${question}` : '')
          : question || 'What step would you try next?'));
        return 'handled';
      }
      say('Let us stay with the current question. Would you like a hint, or to hear it again?');
      return 'clarified';
    }
    if (valid.length) {
      const ordered = [...normalized].sort((x, y) => Number(x.name.startsWith('speech.repeat')) - Number(y.name.startsWith('speech.repeat')));
      const contentActions = ordered.filter((a) => ['lesson.hint', 'lesson.explainStep', 'lesson.explainPart'].includes(a.name));
      const executable = ordered.filter((a) => !contentActions.includes(a));
      if (contentActions.length && result.reply) {
        if (!['explain-differently', 'revisit-part', 'recap', 'hint'].includes(move)) say(modelReply(result.reply));
      } else if (contentActions.length) say('Let us stay with the current question. What would you like me to explain?');
      if (executable.length) await executeActions(executable);
      acted = true;
    }
    // Activity-changing actions supply their own prompt. Never execute a
    // second teaching move or overwrite that prompt in the same turn.
    if (normalized.some(changesLearningState)) return 'handled';
    if (['guided-example', 'independent-practice'].includes(move) && unfinished) {
      say('We are still on this question. Would you like help with it, or do you want to leave it unfinished?');
      return 'clarified';
    }
    if (move !== 'none') {
      // A plan may express one intent twice (lesson.morePractice
      // action AND the matching teaching move). Execute it once.
      const duplicated = (move === 'guided-example' || move === 'independent-practice')
        && valid.some((a) => a.name === 'lesson.morePractice'
          && (a.args as { mode?: unknown }).mode === (move === 'guided-example' ? 'guided' : 'independent'));
      if (duplicated) { /* already executed as an action above */ }
      else if (gate.ok) {
        // Explanatory moves use the guarded, contextual model text.
        // State-bearing moves still execute their authoritative gate.
        if (result.reply && ['explain-differently', 'revisit-part', 'recap', 'hint'].includes(move)) say(modelReply(result.reply));
        else executeTeachingMove(move);
        acted = true;
      }
      else {
        say('Let us stay with the current question. Would you like a hint, or to hear it again?');
        return 'clarified';
      }
      // With a reply, the model's own words (explaining the task,
      // helping) are spoken below; the move alone was refused.
    }
    if (!acted && result.reply) {
      if (/what is(?: the)?(?: value of)? x\b|what does x equal/i.test(result.reply)) currentQuestionRef.current = result.reply;
      say(modelReply(result.reply)); acted = true;
    }
    if (!acted && !result.reply && !result.clarification) {
      say('Your question is still waiting. Would you like help with the current step, or to hear the question again?');
      return 'clarified';
    }
    if (!acted && result.clarification) { notice(modelReply(result.clarification)); return 'clarified'; }
    // CONVERSATION-TURN CONTRACT (enforced here, so it holds even
    // with an older backend that omits the field): if teaching
    // must continue without learner input, continue automatically
    // - once. A plan may not strand an active lesson in silence.
    const continuation = deriveContinuation(
      { continuation: result.continuation, teachingMove: move, reply: result.reply, actions: valid },
      stageRef.current,
    );
    logLifecycle('continuation', `${continuation} (server said: ${result.continuation ?? 'nothing'}, stage: ${stageRef.current})`);
    // Never make a second model call to repair an incomplete reply.
    // Authoritative stage transitions supply their registered choices.
    return acted ? 'handled' : 'clarified';
  }, [say, executeActions, executeTeachingMove, mathExpr, attempts, wrongSteps, waitForSpeechEnd, advance]);
  orchestrateTurnRef.current = orchestrateTurn;

  // ---------------- input routing (AI-first) ----------------
  const handleText = useCallback(async (raw: string, fromVoice: boolean) => {
    const text = raw.trim();
    turnInputMode.current = fromVoice ? 'speech' : 'typed';
    logLifecycle('learner.received', text);
    if (!text) return;
    if (recoveryRef.current) {
      setLastLearner(text); onLearnerText?.(text);
      if (!/\b(?:no|not|don.t|stop|break|later)\b/i.test(text) && /\b(?:retry|try again|yes|yeah|please do)\b/i.test(text)) { await retryFailedTurn(); return; }
      if (/\b(?:stop|break|no|not now|later)\b/i.test(text)) {
        recoveryRef.current = null; setRecovery(null); conversation.end();
        notice('We can take a break. Your place is kept.'); return;
      }
      // Recovery choices are local and make no paid interpretation request.
      notice('Would you like me to retry your last request, or take a break?'); return;
    }
    onLearnerText?.(text);
    turnEpoch.current++;
    setQuietThinking(false);
    silenceStep.current = 0; // a learner response resets the waiting sequence
    setLastLearner(text); setLivePartial('');
    if (preview) {
      const epoch = turnEpoch.current;
      let choice: Awaited<ReturnType<typeof interpretVoicePreview>> = null;
      try { choice = await interpretVoicePreview(text, 'lesson', preview.index, preview.candidates.length); } catch { /* ask for clarification */ }
      if (!mounted.current || epoch !== turnEpoch.current) return;
      if (choice === 'keep') {
        const chosen = preview.candidates[preview.index];
        const hist: string[] = JSON.parse(localStorage.getItem('tiesua-voice-history') ?? '[]');
        if (settingsRef.current.voiceURI && settingsRef.current.voiceURI !== chosen.uri) hist.push(settingsRef.current.voiceURI);
        localStorage.setItem('tiesua-voice-history', JSON.stringify(hist.slice(-5)));
        settingsRef.current = { ...settingsRef.current, voiceURI: chosen.uri }; onSettingsPatch({ voiceURI: chosen.uri }); setPreview(null); notice(voiceReturn('Keeping that voice.', preview.returnPrompt), chosen.uri);
      } else if (choice === 'next') {
        const n = preview.index + 1;
        if (n >= preview.candidates.length) notice('That was the last voice I have here. Say go back, or that one for this one.', preview.candidates[preview.index].uri);
        else { setPreview({ ...preview, index: n }); speakSample(preview.candidates[n], n, preview.candidates.length); }
      } else if (choice === 'previous') {
        if (preview.index > 0) { const i = preview.index - 1; setPreview({ ...preview, index: i }); speakSample(preview.candidates[i], i, preview.candidates.length); }
        else { setPreview(null); notice(voiceReturn('All right. Back to your original voice.', preview.returnPrompt), preview.originalVoice); }
      } else if (choice === 'cancel') { setPreview(null); notice(voiceReturn('All right. I have cancelled the voice change.', preview.returnPrompt), preview.originalVoice); }
      else notice(voicePreviewPrompt(preview.index, preview.candidates.length), preview.candidates[preview.index].uri);
      return;
    }
    if (confirming) {
      let decision: 'accept' | 'decline' | null = null;
      if (/^(yes|yeah|sure|ok|okay|go ahead|do it|yes please)[.!]?$/i.test(text)) decision = 'accept';
      else if (/^(no|nope|cancel|stop|don'?t|no thanks)[.!]?$/i.test(text)) decision = 'decline';
      else {
        const epoch = turnEpoch.current;
        try {
          const plan = await api.orchestrate(text, {
            screen: 'lesson', stage: stageRef.current,
            pending_confirmation: { question: confirming.label, choices: ['accept', 'decline'] },
            available_actions: ['confirmation.accept', 'confirmation.decline'],
            current_question: `Would you like to ${confirming.label}?`,
            equation: eqRef.current?.equation_text ?? '',
          });
          if (!mounted.current || epoch !== turnEpoch.current) return;
          const actions = (plan.source === 'live-meta' || plan.source === 'mock') ? (plan.actions ?? []).map(validateAction) : [];
          if (actions.length === 1 && actions[0]?.name === 'confirmation.accept') decision = 'accept';
          if (actions.length === 1 && actions[0]?.name === 'confirmation.decline') decision = 'decline';
        } catch { /* clarification keeps the existing question safe */ }
      }
      if (decision === 'accept') {
        const actions = confirming.actions; setConfirming(null);
        if (actions.some(action => action.name === 'lesson.restart')) startLesson();
        else await executeActions(actions);
      } else if (decision === 'decline') { setConfirming(null); say('Okay, we will stay with this question.'); }
      else say(`I did not quite understand. Would you like to ${confirming.label}, or stay here?`);
      return;
    }
    // Immediate stop-speaking: deterministic, instant, no model.
    // (Stopping a session - "I'm done for today" - is a meaningful
    // decision and goes to the orchestrator like everything else.)
    if (/^(stop|stop speaking|be quiet|quiet)$/i.test(text)) { player.stop(); return; }
    if (reviewRef.current !== null) {
      const expected = lessonRef.current.example.steps![reviewRef.current].numericAnswer;
      if (expected !== undefined && checkFractionItem(expected, text) === true) {
        advanceReview(); return;
      }
      const status = await orchestrateTurn(text);
      if (status === 'unavailable') say("I couldn't get a response just now. Please try again.");
      return;
    }

    if (stageRef.current === 'example' && lessonRef.current.id === 'equations-fraction') {
      const current = lessonRef.current.example.steps?.[exampleStep.current];
      if (current?.numericAnswer !== undefined && !isLearnerQuestion(text)) {
        const checked = checkFractionItem(current.numericAnswer, text);
        if (checked === true) { advance('Yes. '); return; }
        if (checked === false) {
          const status = await orchestrateTurn(text, { verified_result: { verdict: 'invalid', solved: false, current_question: current.explanation, learner_answer: text, expected_answer: current.numericAnswer } });
          if (status === 'unavailable') say(`Let us work that out again. ${current.explanation}`);
          return;
        }
      }
    }

    // A learner may contribute arithmetic while a worked example is in
    // progress. Check the stated calculation, without treating it as an
    // equation transformation or a request to advance the example.
    if (stageRef.current === 'example' && !isLearnerQuestion(text)) {
      const calculation = interpretNumericAnswer(text);
      if (calculation && /[×÷+*\-/]|\b(?:times|plus|minus|divided|multiplied)\b/i.test(text)) {
        if (calculation.arithmeticCorrect === false) say('Let us check that calculation again. What do you get? We can stay on this step.');
        else await orchestrateTurn(text, { verified_calculation: calculation });
        return;
      }
    }

    const chosenAction = resolvePendingAction(text);
    if (chosenAction) {
      const unfinished = (lessonRef.current.kind === 'equations' && Boolean(eqRef.current) && !eqRef.current?.solved)
        || (lessonRef.current.kind === 'fractions' && ['guided', 'independent'].includes(stageRef.current));
      if (unfinished && DEPARTURE_ACTIONS.has(chosenAction.name)) {
        say('That choice is no longer active. We are still on this question. Would you like help or to leave it unfinished?');
        return;
      }
      await executeActions([chosenAction]); return;
    }

    // Prerequisite detour: a number answers its check question;
    // anything else stays a conversation inside the detour.
    if (prereqRef.current) {
      if (extractNumber(text) !== null) { handlePrereqAnswer(text); return; }
      const st = await orchestrateTurn(text);
      if (st === 'unavailable') say('My live teaching help is not connected just now. Your place in the lesson is saved.');
      return;
    }

    // Spoken answers are processed as spoken answers. There is no
    // automatic typing form: "You said" shows exactly what was
    // recognised, and if the meaning is genuinely unclear the
    // conversation asks - it never silently opens a form. The
    // typing sheet opens only from the keyboard icon.

    // Fractions practice: a number is a verified answer. All other
    // wording is conversation for the orchestrator.
    if (lessonRef.current.kind === 'fractions' && (stageRef.current === 'guided' || stageRef.current === 'independent')) {
      if (extractNumber(text) !== null) { await handleFractionAnswer(text); return; }
      const st = await orchestrateTurn(text);
      if (st === 'unavailable') say('My live teaching help is not connected just now. Your work here is saved.');
      return;
    }

    // Equations in progress: the backend verifier classifies and
    // judges the input (operation, equation, answer, question).
    // Conversational turns it flags come back here for Meta.
    if (lessonRef.current.kind === 'equations' && sessionId && eqRef.current && !eqRef.current.solved) {
      await submitMath(text);
      return;
    }

    // Every other meaningful utterance: the central orchestrator
    // decides. No local phrasebook interprets it first.
    const st = await orchestrateTurn(text);
    if (st === 'unavailable') {
      notice("I could not get a response. Your place is kept.");
    }
  }, [preview, confirming, executeActions, sessionId, submitMath, handleFractionAnswer, say, onSettingsPatch, speakSample, mathExpr, startLesson, orchestrateTurn, player, onLearnerText]);

  // ---------------- talk: ONE application conversation session ----------------
  // The session (App-level) owns the microphone, auto-listening,
  // barge-in and turn-taking. This runner only registers its
  // utterance handler and offers push-to-talk as an alternative.
  const listening = conversation.listening;
  const handsFree = active && conversation.enabled;
  useEffect(() => {
    if (!active) return;
    conversation.register('lesson', (text) => handleText(text, true), (partial) => {
      lastSpeechAt.current = Date.now();
      setLivePartial(partial);
    });
    return () => conversation.unregister('lesson');
  }, [active, conversation, handleText]);

  const toggleListening = useCallback(() => {
    if (!recognitionSupported()) { say('Voice answering is not available in this browser. Tap the keyboard icon - typing works fully.'); return; }
    conversation.listenOnce();
  }, [say, conversation]);

  // Progressive silence follow-ups: 45s, then +30, +45, +60, +90
  // between gentle prompts. Paused by TieSua's speech, processing,
  // push-to-talk capture, and ACTUAL detected learner speech -
  // never merely by hands-free microphone capture being active.
  const [silenceTick, setSilenceTick] = useState(0);
  useEffect(() => {
    const awaiting = !recovery && ['intro', 'example', 'guided', 'independent', 'choice'].includes(stage);
    if (!active || !handsFree || !silenceArmed({ awaitingResponse: awaiting && !quietThinking, speaking: player.speaking, busy: busy || orchestrating || conversation.phase === 'thinking', listening, handsFree })) return;
    const step = silenceStep.current;
    const text = followUpForStep(step);
    if (text === null) return; // quiet waiting state
    logLifecycle('silence.armed', `step ${step + 1}: ${SILENCE_INTERVALS_SECONDS[step]}s`);
    const t = window.setTimeout(() => {
      if (speechIsRecent(Date.now() - lastSpeechAt.current)) {
        // The learner is mid-response: re-check shortly instead
        // of interrupting them with a reminder.
        setSilenceTick((n) => n + 1);
        return;
      }
      silenceStep.current = step + 1;
      logLifecycle('silence.follow-up', `step ${step + 1} after ${SILENCE_INTERVALS_SECONDS[step]}s`);
      // Reminders are notices, never a replacement for the teaching question.
      player.speak(textPlan(text));
    }, SILENCE_INTERVALS_SECONDS[step] * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, player.speaking, listening, busy, orchestrating, conversation.phase, sayText, handsFree, silenceTick, quietThinking]);

  useEffect(() => {
    if (settings.talkShortcut !== 'alt-t') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); toggleListening(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.talkShortcut, toggleListening]);

  const STAGE_LABEL: Record<LessonStage, string> = {
    intro: 'introduction', example: 'worked example', guided: 'together', independent: 'your turn',
    choice: 'your choice', complete: 'lesson complete', 'awaiting-topic': "choosing what's next",
  };
  const status = player.preparing ? 'Preparing speech' : player.speaking ? 'Speaking' : listening ? (recovery ? 'Listening. Say retry or take a break' : 'Listening - speak now') : recovery ? 'Connection unavailable. Retry when ready' : busy || orchestrating ? 'Thinking' : handsFree ? 'Ready - hands-free listening will start' : 'Ready';
  const displayedStep = reviewIndex ?? exampleStep.current;
  const displayedMath = reviewIndex !== null ? lesson.example.steps?.[reviewIndex].expression ?? '' : mathExpr;
  let parsedMath = null as ReturnType<typeof parseExpression> | null;
  if (displayedMath) { try { parsedMath = parseExpression(displayedMath); } catch { parsedMath = null; } }

  return (
    <section className="mn-lesson-wrap" aria-labelledby="lesson-heading">
      <div className="mn-lesson-top">
        <h1 id="lesson-heading" className="mn-topic-name">{lesson.title}</h1>
        <p className="mn-stage-line">{stage === 'example' && lesson.example.steps?.[displayedStep]?.title ? `${lesson.example.steps[displayedStep].title} (worked example)` : STAGE_LABEL[stage]}</p>
        {reviewIndex !== null && <div className="mn-review-status"><p role="status">Reviewing an earlier step</p><button type="button" className="btn" onClick={() => reviewStep(exampleStep.current)}>Return to current step</button></div>}

      </div>
      <div className="mn-step-presentation">
        {stage === 'example' && <nav className="mn-review-nav" aria-label="Review teaching steps">
          <button type="button" className="mn-review-arrow" aria-label="Previous teaching step" disabled={displayedStep === 0} onClick={() => reviewStep(displayedStep - 1)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5L7 12l8 7" /></svg></button>
          <button type="button" className="mn-review-arrow" aria-label="Next visited teaching step" disabled={displayedStep >= exampleStep.current} onClick={() => reviewStep(displayedStep + 1)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 5l8 7-8 7" /></svg></button>
        </nav>}
      {parsedMath && (
        <>
          <div className="mn-math">{displayedMath === '12 ÷ 4 = 3' ? <span aria-label="twelve divided by four equals three">12 ÷ 4 = 3</span> : <MathView node={parsedMath} />}</div>
          <p className="mn-caption">{displayedMath === '12 ÷ 4 = 3' ? 'twelve divided by four equals three' : captionFor(displayedMath!)}</p>
        </>
      )}
      </div>
      <div className="mn-teach">
        <p className="mn-say" aria-live={settings.announceMode === 'app-voice' ? 'off' : 'polite'} aria-atomic="true"><span className="mn-speaker">TieSua:</span> {sayText}</p>
        {(livePartial || lastLearner) && (
          <p className="mn-yousaid"><span className="mn-speaker">You said:</span> {livePartial || lastLearner}</p>
        )}
      </div>
      <div className="mn-voice">
        {recovery && <button type="button" className="mn-kbd" aria-label="Retry previous answer" title="Retry previous answer" onClick={() => void retryFailedTurn()}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6M20 7l-4-4" /></svg>
        </button>}
        <button type="button" className={listening ? 'mn-mic mn-mic-live' : 'mn-mic'} onClick={toggleListening} disabled={!voiceSupported && !listening} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Talk to TieSua'}>
          <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" fill="currentColor" /></svg>
        </button>
        <p className="mn-statusline" role="status">{status}.</p>
        <button type="button" className="mn-kbd" aria-label="Type instead" aria-expanded={sheet} onClick={() => { setSheet((s) => !s); window.setTimeout(() => inputRef.current?.focus(), 50); }}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 3v2h2V8H6zm4 0v2h2V8h-2zm4 0v2h2V8h-2zm4 0v2h2V8h-2zM6 12v2h2v-2H6zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 16v2h10v-2H7z" fill="currentColor" /></svg>
        </button>
        <StopSpeakingButton player={player} />
        <button type="button" className="mn-stop" aria-pressed={handsFree} onClick={() => conversation.toggle()}>
          {handsFree ? 'Conversation: on' : 'Conversation: off'}
        </button>
        {!voiceSupported && <p className="mn-fine">Voice answering is not available in this browser - typing works fully.</p>}
      </div>
      {sheet && (
        <form className="mn-sheet mn-sheet-static" onSubmit={(e) => { e.preventDefault(); const v = input; setInput(''); setSheet(false); void handleText(v, false); }}>
          <label className="mn-sheet-label" htmlFor="lesson-input">Your answer</label>
          <input id="lesson-input" ref={inputRef} className="mn-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type here..." autoComplete="off" />
          <div className="mn-sheet-actions">
            <button type="submit" className="mn-send">Send</button>
            <button type="button" className="mn-cancel" onClick={() => setSheet(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}


