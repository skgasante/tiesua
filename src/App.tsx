import { voiceReturn } from './conversation/voiceReturn';
import { responsePrompt } from './conversation/responsePrompt';
import { ConversationText } from './components/ConversationText';
import { voiceCandidates } from './speech/voiceCandidates';
import { recognitionErrorMessage } from './speech/recognitionError';
import { RetainedScreen } from './components/RetainedScreen';
import { executeSharedAction, normalizeTurnActions } from './conversation/actionExecutor';
import pillLogo from './assets/tiesua-pill.png';
import { interpretVoicePreview, voicePreviewPrompt } from './conversation/voicePreview';
import { preferredVoice } from './speech/preferredVoice';
import { returningLearner } from './conversation/homeWelcome';
import { loadSnapshot } from './lessons/resume';
import { TIESUA_GUIDE, TUTORIAL_START, TUTORIAL_CONTROLS, TUTORIAL_CHOICE, TUTORIAL_EXAMPLE } from './conversation/guide';
import { useEffect, useState } from 'react';
import { HearDifference } from './views/HearDifference';
import { Home } from './views/Home';
import { Lessons } from './views/Lessons';
import { LessonRunner } from './views/LessonRunner';
import { VoiceCompare } from './views/VoiceCompare';
import { HandsFreeLab } from './views/HandsFreeLab';
import { loadProgress, markCompleted, recordActivity, saveProgress, type Progress } from './lessons/progress';
import { parseExpression } from './math/parser';
import { toSpeechPlan } from './speech/speechPlan';
import { speechCapabilities } from './speech/provider';
import { useSpeech, type AnnounceMode, type SpeechSettings } from './speech/useSpeech';
import { DesignReview } from './design/DesignReview';
import { MinimalReview } from './design/MinimalReview';
import { GlobalConversation } from './components/GlobalConversation';
import { catalogueContext, LESSONS, resolveLessonQuery, type LessonDef } from './lessons/catalogue';
import { clearPendingChoice, pendingChoiceContext, resolvePendingAction, setPendingChoice } from './conversation/pendingChoice';
import { api } from './learn/api';
import { validateAction, availableActions } from './conversation/actions';
import { previewInput, recordTurn } from './conversation/decisionTrace';
import { isStopSpeakingPhrase, lessonsAnnouncement } from './conversation/globalConversation';
import type { SpeechPlan } from './speech/speechPlan';
import { useRef } from 'react';
import { ConversationSession, PHASE_LABEL, type SessionSnapshot } from './speech/conversationSession';
import { recognitionSupported } from './speech/recognition';
import { ListeningCue } from './speech/listeningCue';

export interface ConversationFacade {
  enabled: boolean;
  dormant: boolean;
  listening: boolean;
  phase: SessionSnapshot['phase'];
  toggle: () => void;
  end: () => void;
  lessonReady: () => void;
  listenOnce: () => void;
  register: (id: string, handler: (text: string) => Promise<void> | void, onPartial?: (text: string) => void) => void;
  unregister: (id: string) => void;
}

export { PHASE_LABEL } from './speech/conversationSession';

const textPlan = (text: string): SpeechPlan => ({ mode: 'natural', segments: [{ id: 'c', nodeId: 'c', text, pauseAfterMs: 0, boundary: 'none' }] });

type View = 'home' | 'lessons' | 'lesson' | 'explore' | 'settings' | 'sound-settings' | 'interaction-settings' | 'voice-compare' | 'interruption-lab';
const SETTINGS_KEY = 'tiesua-settings';

const RATE_DEFAULT_VERSION = '1';
const DEFAULTS: SpeechSettings = { rate: 0.8, pauseScale: 1, volume: 1, textSize: 100, voiceURI: '', announceMode: 'app-voice', talkShortcut: 'none' };

function loadSettings(): SpeechSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<SpeechSettings>;
    // Apply the slower baseline once to returning learners as well. Later
    // learner-selected speeds remain their choice across reloads.
    if (localStorage.getItem('tiesua-rate-default-version') !== RATE_DEFAULT_VERSION) saved.rate = DEFAULTS.rate;
    return { ...DEFAULTS, ...saved };
  }
  catch { return DEFAULTS; }
}

export default function App() {
  const hasVisited = useRef(returningLearner(localStorage));
  if (new URLSearchParams(window.location.search).has('minimal')) return <MinimalReview />;
  if (new URLSearchParams(window.location.search).has('design')) return <DesignReview />;
  const [view, setViewState] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (requested === 'hear') return 'explore';
    if (requested === 'learn') return 'lessons';
    return requested === 'lessons' || requested === 'explore' || requested === 'settings' ? requested : 'home';
  });
  const workspaceRef = useRef<HTMLElement>(null);
  const viewPositions = useRef(new Map<View, { workspace: number; page: number }>());
  useEffect(() => {
    const main = workspaceRef.current;
    if (!main) return;
    const position = viewPositions.current.get(view);
    main.scrollTop = position?.workspace ?? 0;
    document.documentElement.scrollTop = position?.page ?? 0;
    document.body.scrollTop = position?.page ?? 0;
    const heading = main.querySelector<HTMLElement>('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    else main.focus({ preventScroll: true });
  }, [view]);
  const visitedViews = useRef(new Set<View>([view]));
  const tabViews = useRef<Record<string, View>>({ home: 'home', lessons: 'lessons', explore: 'explore', settings: 'settings' });
  const setView = (next: View) => {
    viewPositions.current.set(view, { workspace: workspaceRef.current?.scrollTop ?? 0, page: window.scrollY || document.documentElement.scrollTop });
    visitedViews.current.add(next);
    if (next === 'lesson') { tabViews.current.home = next; tabViews.current.lessons = next; }
    else if (['settings', 'sound-settings', 'interaction-settings', 'voice-compare', 'interruption-lab'].includes(next)) tabViews.current.settings = next;
    else if (next === 'home' || next === 'lessons' || next === 'explore') tabViews.current[next] = next;
    setViewState(next);
  };
  const [currentLessonId, setCurrentLessonId] = useState<string>('equations-fraction');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [settings, setSettings] = useState<SpeechSettings>(loadSettings);
  const player = useSpeech(settings);
  const caps = speechCapabilities();
  const [voices, setVoices] = useState(player.provider.voices());
  const englishVoices = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang));
  const savedOtherVoice = voices.find((voice) => voice.uri === settings.voiceURI && !/^en(?:[-_]|$)/i.test(voice.lang));
  const [listeningQuiet, setListeningQuiet] = useState(() => {
    try { const n = Number(localStorage.getItem('tiesua-listening-quiet-seconds')); return [2, 3, 5, 8].includes(n) ? n : 2; } catch { return 2; }
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem('tiesua-rate-default-version', RATE_DEFAULT_VERSION);
  }, [settings]);
  useEffect(() => { document.documentElement.style.fontSize = `${(16 * settings.textSize) / 100}px`; }, [settings.textSize]);
  useEffect(() => {
    const refresh = () => setVoices(player.provider.voices());
    refresh();
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
  }, [player.provider]);

  const ICONS: Record<string, string> = {
    home: 'M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10',
    lessons: 'M12 3L2 8l10 5 10-5-10-5z M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5 M22 8v7',
    explore: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M16.5 7.5l-2.5 6.5-6.5 2.5 2.5-6.5z',
    settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L14.8 3h-5.6L8.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.5 3h5.6l.5-3a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z',
  };
  const openLesson = (id: string) => {
    sessionRef.current?.setTransitionPending(true);
    if (recognitionSupported() && !sessionRef.current?.snapshot().enabled) {
      listeningCueRef.current?.unlock();
      void sessionRef.current?.enable();
    }
    player.stop(); setCurrentLessonId(id); setView('lesson');
  };

  // ---- ONE application-level conversation session ----
  // Owns the microphone, VAD barge-in and turn-taking across every
  // screen. Screens register their utterance handler; the session
  // dispatches each final utterance exactly once and resumes
  // listening after TieSua finishes speaking.
  const globalHandlerRef = useRef<(text: string) => Promise<void> | void>(async () => undefined);
  const registeredRef = useRef<{ id: string; handler: (text: string) => Promise<void> | void; onPartial?: (text: string) => void } | null>(null);
  const playerRef = useRef(player); playerRef.current = player;
  const [sessionSnap, setSessionSnap] = useState<SessionSnapshot>({ enabled: false, phase: 'off', listening: false, dormant: false });
  const [lastHeard, setLastHeard] = useState('');
  const sessionRef = useRef<ConversationSession | null>(null);
  const listeningCueRef = useRef<ListeningCue | null>(null);
  if (!listeningCueRef.current) listeningCueRef.current = new ListeningCue();
  if (!sessionRef.current) {
    sessionRef.current = new ConversationSession({
      onUtterance: (text) => { setLastHeard(text); return (registeredRef.current?.handler ?? globalHandlerRef.current)(text); },
      onPartial: (text) => registeredRef.current?.onPartial?.(text),
      onSnapshot: (snap) => setSessionSnap(snap),
      stopSpeech: () => playerRef.current.stop(),
      isSpeaking: () => playerRef.current.isSpeaking(),
      onListeningCue: (kind) => listeningCueRef.current?.play(kind),
      onRecognitionError: reason => playerRef.current.speak(textPlan(recognitionErrorMessage(reason))),
    });
  }
  const session = sessionRef.current;
  useEffect(() => { if (view !== 'lesson') session.setTransitionPending(false); }, [view, session]);
  useEffect(() => {
    player.setActivityListener(active => session.notifySpeaking(active));
    return () => player.setActivityListener(null);
  }, [player.setActivityListener, session]);
  useEffect(() => () => session.disable(), [session]);
  const conversation: ConversationFacade = {
    enabled: sessionSnap.enabled,
    listening: sessionSnap.listening,
    dormant: sessionSnap.dormant,
    phase: sessionSnap.phase,
    end: () => session.disable(),
    lessonReady: () => session.setTransitionPending(false),
    toggle: () => {
      if (sessionSnap.enabled) { session.disable(); return; }
      if (!recognitionSupported()) {
        player.speak(textPlan('Voice answering is not available in this browser. Typing works fully on every screen.'));
        return;
      }
      listeningCueRef.current?.unlock();
      void session.enable();
    },
    listenOnce: () => {
      if (!recognitionSupported()) {
        player.speak(textPlan('Voice answering is not available in this browser. Typing works fully on every screen.'));
        return;
      }
      listeningCueRef.current?.unlock();
      session.listenOnce();
    },
    register: (id, handler, onPartial) => { registeredRef.current = { id, handler, onPartial }; },
    unregister: (id) => { if (registeredRef.current?.id === id) registeredRef.current = null; },
  };

  // ---- Global conversation for secondary screens (Lessons,
  // Explore, Settings): the same central orchestrator decides;
  // this only executes validated actions and announces true state.
  const lastGlobalQ = useRef('What would you like to do?');
  const globalPreview = useRef<{ candidates: { name: string; uri: string }[]; index: number; returnPrompt: string; originalVoice: string } | null>(null);
  const lastGlobalSpokeAtRef = useRef(0);
  const temporaryGlobal = useRef<Partial<SpeechSettings>>({});
  const sayGlobal = (text: string, voiceURI?: string) => { lastGlobalQ.current = text; lastGlobalSpokeAtRef.current = Date.now(); const once = temporaryGlobal.current; temporaryGlobal.current = {}; player.speak(textPlan(text), false, { ...once, ...(voiceURI ? { voiceURI } : globalPreview.current ? { voiceURI: globalPreview.current.candidates[globalPreview.current.index].uri } : {}) }); };
  const tutorial = useRef<'repeat' | 'controls' | 'choice' | null>(null);
  const startTutorial = () => { clearPendingChoice(); tutorial.current = 'repeat'; sayGlobal(TUTORIAL_START); };
  const tutorialNext = () => {
    if (tutorial.current === 'repeat') { tutorial.current = 'controls'; sayGlobal(TUTORIAL_CONTROLS); return; }
    if (tutorial.current === 'controls') {
      tutorial.current = 'choice';
      setPendingChoice([
        { id: 'study', title: 'start studying', action: { name: 'help.offerLessons', args: {} } },
        { id: 'again', title: 'hear the tutorial again', action: { name: 'help.tutorialNext', args: {} } },
      ], TUTORIAL_CHOICE);
      sayGlobal(TUTORIAL_CHOICE); return;
    }
    startTutorial();
  };
  const speakSampleGlobal = (voice: { name: string; uri: string }, index: number, total: number) => {
    player.speak(textPlan(voicePreviewPrompt(index, total)), false, { voiceURI: voice.uri });
  };
  const globalEpoch = useRef(0);
  useEffect(() => { globalEpoch.current++; if (view === 'lesson' || view === 'lessons' || view === 'explore') tutorial.current = null; }, [view]);
  const handleGlobalText = async (raw: string) => {
    const epoch = ++globalEpoch.current;
    const text = raw.trim();
    if (!text) return;
    setLastHeard(text);
    if (isStopSpeakingPhrase(text)) { player.stop(); return; }
    if (globalPreview.current) {
      const preview = globalPreview.current;
      let choice: Awaited<ReturnType<typeof interpretVoicePreview>> = null;
      try { choice = await interpretVoicePreview(text, view, preview.index, preview.candidates.length); } catch { /* ask for clarification */ }
      if (epoch !== globalEpoch.current || globalPreview.current !== preview) return;
      if (choice === 'keep') {
        const chosen = preview.candidates[preview.index];
        const hist: string[] = JSON.parse(localStorage.getItem('tiesua-voice-history') ?? '[]');
        if (settings.voiceURI && settings.voiceURI !== chosen.uri) hist.push(settings.voiceURI);
        localStorage.setItem('tiesua-voice-history', JSON.stringify(hist.slice(-5)));
        setSettings((s) => ({ ...s, voiceURI: chosen.uri })); globalPreview.current = null; sayGlobal(voiceReturn('Keeping that voice.', preview.returnPrompt), chosen.uri);
      } else if (choice === 'next') {
        const n = preview.index + 1;
        if (n >= preview.candidates.length) sayGlobal('That was the last voice I have here. Say go back, or that one for this one.');
        else { globalPreview.current = { ...preview, index: n }; speakSampleGlobal(preview.candidates[n], n, preview.candidates.length); }
      } else if (choice === 'previous') {
        if (preview.index > 0) { const i = preview.index - 1; globalPreview.current = { ...preview, index: i }; speakSampleGlobal(preview.candidates[i], i, preview.candidates.length); }
        else { globalPreview.current = null; sayGlobal(voiceReturn('All right. Back to your original voice.', preview.returnPrompt), preview.originalVoice); }
      } else if (choice === 'cancel') { globalPreview.current = null; sayGlobal(voiceReturn('All right. I have cancelled the voice change.', preview.returnPrompt), preview.originalVoice); }
      else sayGlobal(voicePreviewPrompt(preview.index, preview.candidates.length));
      return;
    }
    const chosenAction = resolvePendingAction(text);
    if (chosenAction?.name === 'help.offerLessons') {
      tutorial.current = null;
      const question = lessonsAnnouncement(LESSONS); setPendingChoice(LESSONS, question); sayGlobal(question); return;
    }
    if (chosenAction?.name === 'help.guide') { startTutorial(); return; }
    if (chosenAction?.name === 'help.tutorialNext' && tutorial.current) { tutorialNext(); return; }
    if (chosenAction?.name === 'lesson.openLesson') {
      const chosen = resolveLessonQuery(String(chosenAction.args.query));
      if (chosen.kind === 'open') { openLesson(chosen.lesson.id); return; }
    }
    let result: Awaited<ReturnType<typeof api.orchestrate>> | null = null;
    try {
      result = await api.orchestrate(text, {
        screen: view, last_question: lastGlobalQ.current,
        available_actions: tutorial.current ? [...availableActions(view), 'speech.repeatCurrent', 'help.tutorialNext', 'help.tutorialExit'] : availableActions(view),
        tutorial: tutorial.current ? { active: true, stage: tutorial.current, sample: TUTORIAL_EXAMPLE } : undefined,
        pending_options: pendingChoiceContext(),
        available_lessons: LESSONS.map((l) => ({ id: l.id, title: l.title, topic: l.topic, objective: l.objective })),
        catalogue: catalogueContext(),
        settings: { rate: settings.rate, pauseScale: settings.pauseScale, volume: settings.volume, textSize: settings.textSize },
      });
    } catch { result = null; }
    if (epoch !== globalEpoch.current) return;
    if (!result || result.source === 'unavailable' || /(?:Error|Timeout)$/.test(result.diagnostics?.note ?? '')) {
      session.disable();
      player.speak(textPlan('I could not get a response. Listening is paused. Use the microphone button to try again, or type with the keyboard button.'));
      return;
    }
    const live = result !== null && (result.source === 'live-meta' || result.source === 'mock');
    // A continuation accepted at Home resumes the offered saved lesson.
    // It must never execute the in-lesson step advancement action here.
    const offeredResume = view === 'home' ? pendingChoiceContext().find(option => option.id === 'resume') : undefined;
    const valid = live ? (result!.actions ?? []).map((a) => validateAction(
      a.name === 'lesson.continue' && offeredResume ? offeredResume.action : a
    )).filter(Boolean) : [];
    recordTurn({
      screen: 'other', ...previewInput(text), interpretedBy: live ? 'meta' : 'none',
      metaCalled: result?.source === 'live-meta',
      decision: live ? 'global-orchestrator-plan' : `global-orchestrator-${result?.source ?? 'unreachable'}`,
      actionsExecuted: valid.map((a) => a!.name),
      replyOrigin: result?.source === 'live-meta' ? 'live-meta' : result?.source === 'mock' ? 'mock' : 'none',
      verification: { involved: false }, nextStateChosenBy: live && valid.length ? 'meta-proposal' : 'none',
    });
    if (!live) {
      sayGlobal(result?.clarification ?? 'My live teaching help is not connected just now, so I cannot decide that by talking yet. The buttons on this screen still work fully.');
      return;
    }
    const supported = tutorial.current ? [...availableActions(view), 'speech.repeatCurrent', 'help.tutorialNext', 'help.tutorialExit'] : availableActions(view);
    if (valid.length !== (result!.actions ?? []).length || valid.some(a => !supported.includes(a!.name))) {
      sayGlobal('I could not carry out that request from this screen. What would you like to do?');
      return;
    }
    let acted = false;
    const normalized = normalizeTurnActions(valid.filter((a): a is NonNullable<typeof a> => a !== null));
    if (!normalized) { sayGlobal('I heard more than one change of activity. Which would you like to do first?'); return; }
    let announcedLessons = false;
    let openFailed = false;
    let unsupported = false;
    for (const a of normalized) {
      const action = a as { name: string; args: Record<string, unknown>; scope?: string };
      if (tutorial.current && action.name === 'speech.repeatCurrent') {
        if (tutorial.current === 'repeat') { tutorial.current = 'controls'; sayGlobal(`${TUTORIAL_EXAMPLE} That is how you can ask me to repeat. ${TUTORIAL_CONTROLS}`); }
        else sayGlobal(lastGlobalQ.current);
        return;
      }
      if (tutorial.current && action.name === 'help.tutorialNext') { tutorialNext(); return; }
      if (tutorial.current && action.name === 'help.tutorialExit') { tutorial.current = null; clearPendingChoice(); sayGlobal('Okay. You can ask to study whenever you are ready.'); return; }
      if ((action.name === 'help.offerLessons' || action.name === 'nav.openLessons') && view === 'home') {
        tutorial.current = null;
        const question = lessonsAnnouncement(LESSONS); setPendingChoice(LESSONS, question); sayGlobal(question); return;
      }
      const common = executeSharedAction(action, {
        settings, patch: (patch) => setSettings((s) => ({ ...s, ...patch })),
        temporary: (patch) => { temporaryGlobal.current = { ...temporaryGlobal.current, ...patch }; },
        navigate: (destination) => {
          setView(destination);
          if (destination === 'lessons') {
            const question = lessonsAnnouncement(LESSONS);
            setPendingChoice(LESSONS, question); sayGlobal(question); announcedLessons = true;
          }
        }, stop: () => player.stop(), endConversation: () => session.disable(), waitForLearner: () => {}, guide: () => { if (view === 'home') startTutorial(); else sayGlobal(TIESUA_GUIDE); }, demonstrate: (plan) => player.speak(plan),
      });
      if (common) {
        if (action.name === 'speech.stop' || action.name === 'help.guide' || action.name.startsWith('demo.')) return;
        if (action.name === 'conversation.end') { sayGlobal(common.message); return; }
        if (action.name === 'conversation.wait') {
          sayGlobal(tutorial.current === 'controls' ? `${common.message} That is how you can ask for more time. When you are ready, say you would like to continue, or ask me a question.` : common.message);
          return;
        }
        acted = true; continue;
      }
      if (action.name === 'reading.temporaryStyle') {
        try { sessionStorage.setItem('tiesua-temp-rate', String(Math.max(0.6, settings.rate * 0.7))); } catch { /* unavailable */ }
        acted = true;
      } else if (action.name === 'speech.previewVoice') {
        if (action.args.direction === 'previous') {
          const hist: string[] = JSON.parse(localStorage.getItem('tiesua-voice-history') ?? '[]');
          const prev = hist.pop();
          if (prev) { setSettings((s) => ({ ...s, voiceURI: prev })); localStorage.setItem('tiesua-voice-history', JSON.stringify(hist)); sayGlobal('Back to your previous voice.'); }
          else sayGlobal('There is no previous voice saved yet.');
        } else if (action.args.direction === 'keep') sayGlobal('There is no voice being previewed right now. Your current voice has not changed.');
        else {
          const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
          const pool = en.length ? en : voices;
          const candidates = voiceCandidates(pool, String(action.args.descriptor ?? ''));
          if (!candidates.length) sayGlobal('No other voices are available in this browser just now.');
          else {
            globalPreview.current = { candidates, index: 0, returnPrompt: lastGlobalQ.current, originalVoice: settings.voiceURI };
            speakSampleGlobal(candidates[0], 0, candidates.length);
          }
        }
        acted = true;
      } else if (action.name === 'lesson.openLesson') {
        // Decisive executor resolution: an exact title opens now.
        // Only a genuinely close call becomes a remembered choice,
        // announced in the order the learner will answer against.
        const res = resolveLessonQuery(String(action.args.query ?? text));
        if (res.kind === 'open') { clearPendingChoice(); openLesson(res.lesson.id); return; }
        if (res.kind === 'ambiguous') { setPendingChoice(res.options, lessonsAnnouncement(res.options)); sayGlobal(lessonsAnnouncement(res.options)); acted = true; openFailed = true; }
        else { sayGlobal(`I cannot teach ${String(action.args.query ?? '')} yet. ${lessonsAnnouncement(LESSONS)}`); acted = true; openFailed = true; }
      } else unsupported = true;
    }
    if (unsupported) { sayGlobal('I cannot do that from this screen. You can open a lesson, change settings, or hear the difference.'); return; }
    if (globalPreview.current && acted) return;
    if (announcedLessons) return;
    if (openFailed) return; // executor already spoke the truth; suppress any model claim
    if (result!.reply) {
      if (/\b(?:we (?:will|'ll|can) stop here|the conversation (?:is|has) stopped|the microphone is off)\b/i.test(result!.reply))
        sayGlobal('I have not stopped the conversation yet. Would you like me to turn the microphone off?');
      else sayGlobal(responsePrompt(result!.reply, lastGlobalQ.current.includes('?') ? lastGlobalQ.current : 'Would you like to study, change a setting, or hear the difference?'));
      return;
    }
    if (result!.clarification) sayGlobal(result!.clarification);
    else if (acted) sayGlobal('Done. What would you like to do next?');
    else sayGlobal('Would you like to open a lesson, or hear the difference?');
  };
  globalHandlerRef.current = handleGlobalText;

  // Only attempt output on opening. Microphone authorization still requires a gesture.
  useEffect(() => {
    if (view !== 'home') return;
    const timer = window.setTimeout(() => {
      if (session.snapshot().enabled || playerRef.current.isSpeaking()) return;
      const greeting = hasVisited.current
        ? 'Select the microphone button when you are ready.'
        : 'Select the microphone button to study or hear how this platform works.';
      playerRef.current.speak(textPlan(greeting), false, { startTimeoutMs: 2000 });
    }, 300);
    return () => window.clearTimeout(timer);
    // One attempt per page load, never on tab return or after cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // System-wide next-step invitations: arriving on a secondary
  // screen during a voice conversation opens with what the screen
  // offers and a genuine invitation - never a dead end. Guarded
  // against double-announcing when the orchestrator just spoke.
  useEffect(() => {
    if (!sessionSnap.enabled) return;
    if (Date.now() - lastGlobalSpokeAtRef.current < 2000) return;
    const t = window.setTimeout(() => {
      if (view === 'lessons') { setPendingChoice(LESSONS, lessonsAnnouncement(LESSONS)); sayGlobal(lessonsAnnouncement(LESSONS)); }
      else if (view === 'explore') sayGlobal('This is Explore. You can hear how the same spoken words can hide two different expressions, then hear how I keep them apart. Say hear it ordinary, or hear the clear way.');
      else if (view === 'settings') sayGlobal('These settings change how I sound and how the writing looks. Tell me what to adjust, or say go back to learning.');
      else if (view === 'home') {
        const returning = hasVisited.current;
        const resume = returning ? LESSONS.find(lesson => lesson.id === progress.lastLessonId && loadSnapshot(lesson.id)) : undefined;
        const question = resume ? 'Welcome back. Shall we pick up where we left off?' : returning ? 'Welcome back. Would you like to study?' : 'Would you like to study, or first hear how this platform works?';
        setPendingChoice([
          ...(resume ? [{ id: 'resume', title: 'continue the current lesson', action: { name: 'lesson.openLesson' as const, args: { query: resume.id } } }] : [{ id: 'study', title: 'study', action: { name: 'help.offerLessons' as const, args: {} } }]),
          ...(!returning ? [{ id: 'guide', title: 'hear how this platform works', action: { name: 'help.guide' as const, args: {} } }] : []),
        ], question);
        hasVisited.current = true;
        try { localStorage.setItem('tiesua-visited', '1'); } catch { /* greeting still works without storage */ }
        sayGlobal(question);
      }
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sessionSnap.enabled]);
  const updateProgress = (fn: (p: Progress) => Progress) => setProgress((p) => { const next = fn(p); saveProgress(next); return next; });
  const nav = (v: View, label: string, active = false) => (
    <button type="button" className={active ? 'dock-btn dock-active' : 'dock-btn'} aria-current={active ? 'page' : undefined} onClick={() => { player.stop(); setView(tabViews.current[v] ?? v); }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={ICONS[v]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </button>
  );

  return (
    <div className={settings.textSize >= 150 ? 'app app-large-text' : 'app'}>
      <a className="skip-link" href="#main">Skip to main task</a>
      <header className="topbar">
        <img className="brand-logo" src={pillLogo} alt="TieSua — Hear. Learn. Do More." />
      </header>

      <main id="main" ref={workspaceRef} className="workspace" tabIndex={-1}>
        {sessionSnap.enabled && (
          <p className="mn-session" role="status">Conversation on — {sessionSnap.dormant ? 'Listening paused - tap Talk to try again' : (player.preparing ? 'Preparing speech' : PHASE_LABEL[sessionSnap.phase])}</p>
        )}
        {visitedViews.current.has('home') && (<RetainedScreen active={view === 'home'}>
          <Home active={view === 'home'} player={player} onOpenLesson={openLesson} onBrowse={() => setView('lessons')} onGuide={startTutorial} lastLessonId={progress.lastLessonId}
            handleRequest={handleGlobalText} conversation={conversation} />
        </RetainedScreen>)}

        {visitedViews.current.has('lessons') && (<RetainedScreen active={view === 'lessons'}>
          <Lessons progress={progress} onOpenLesson={openLesson} conversationControls={<GlobalConversation player={player} screenName="Lessons" conversation={conversation} onText={(t) => void handleGlobalText(t)} />} />
        </RetainedScreen>)}

        {visitedViews.current.has('lesson') && (<RetainedScreen active={view === 'lesson'}>
          <LessonRunner active={view === 'lesson'} key={currentLessonId} lessonId={currentLessonId} player={player} settings={settings}
            onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            voices={voices}
            onNavigate={(v) => { player.stop(); setView(v); }}
            onOpenLesson={openLesson}
            onLearnerText={setLastHeard}
            onCompleteLesson={(id) => updateProgress((p) => markCompleted(p, id))}
            onActivity={(id) => updateProgress((p) => recordActivity(p, id))}
            progress={progress} conversation={conversation} />
        </RetainedScreen>)}

        {visitedViews.current.has('explore') && (<RetainedScreen active={view === 'explore'}>
          <HearDifference player={player} conversationControls={<GlobalConversation player={player} screenName="Explore" conversation={conversation} onText={(t) => void handleGlobalText(t)} />} />
        </RetainedScreen>)}

        {visitedViews.current.has('settings') && (<RetainedScreen active={view === 'settings'}>
          <section aria-labelledby="settings-heading">
            <GlobalConversation player={player} screenName="Settings" conversation={conversation} onText={(t) => void handleGlobalText(t)} />
            <h1 id="settings-heading">Make TieSua comfortable</h1>
            <p className="lede">Choose what works best for you. You can also ask TieSua to change these settings.</p>
            <section className="settings-primary" aria-label="Voice and display settings">
              <div className="settings-row"><div className="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></div><div className="settings-copy"><label htmlFor="voice">Voice</label><span>Choose a voice for TieSua.</span></div>
              <div className="settings-voice-control"><select id="voice" value={settings.voiceURI || preferredVoice(voices)?.uri || ''} onChange={(e) => setSettings({ ...settings, voiceURI: e.target.value })}>
                <option value="">Automatic (female English preferred)</option>
                {savedOtherVoice && <option value={savedOtherVoice.uri}>{savedOtherVoice.name} (current selection)</option>}
                {englishVoices.map((v) => <option key={v.uri} value={v.uri}>{v.name} ({v.lang})</option>)}
              </select><button type="button" className="voice-test-button" aria-label="Hear this voice" title="Hear this voice" onClick={() => player.speak(textPlan('Hello! Let us learn mathematics together.'))}><svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></button></div></div>
              <div className="settings-row"><div className="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 18a9 9 0 1 1 16 0M12 16l4-5M12 5v2M5 13h2M17 13h2"/><circle cx="12" cy="16" r="1"/></svg></div><div className="settings-copy"><label htmlFor="rate">Speaking speed</label><span>Adjust how fast TieSua speaks. {settings.rate.toFixed(2)}×</span></div><div className="settings-control">
              <input id="rate" type="range" min={0.6} max={2.5} step={0.05} value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })} /><div className="settings-ends"><span>Slower</span><span>Faster</span></div></div></div>
              <div className="settings-row"><div className="settings-icon settings-icon-text" aria-hidden="true">Aa</div><div className="settings-copy"><label htmlFor="textsize">Writing size</label><span>Make text bigger or smaller.</span></div>
              <select id="textsize" value={settings.textSize} onChange={(e) => setSettings({ ...settings, textSize: Number(e.target.value) })}>
                <option value={100}>Standard (100%)</option><option value={125}>Large (125%)</option>
                <option value={150}>Larger (150%)</option><option value={200}>Largest (200%)</option>
              </select></div>
            </section>
            <nav className="settings-tools" aria-label="More settings">
              <button type="button" className="settings-link" onClick={() => setView('sound-settings')}><span><strong>More sound settings</strong><small>Adjust volume and pauses</small></span><span aria-hidden="true">›</span></button>
              <button type="button" className="settings-link" onClick={() => setView('interaction-settings')}><span><strong>Interaction settings</strong><small>Listening, keyboard and screen reader</small></span><span aria-hidden="true">›</span></button>
            </nav>
          </section>
        </RetainedScreen>)}
        {visitedViews.current.has('sound-settings') && (<RetainedScreen active={view === 'sound-settings'}>
          <section aria-labelledby="more-sound-settings">
            <GlobalConversation player={player} screenName="Sound settings" conversation={conversation} onText={(t) => void handleGlobalText(t)} />
            <button type="button" className="btn" onClick={() => setView('settings')}>Back to Settings</button>
            <section className="pref-group settings-extra" aria-labelledby="more-sound-settings"><h2 id="more-sound-settings">More sound settings</h2><div className="settings-form">
              <label htmlFor="pauses">Grouping pauses: {settings.pauseScale.toFixed(2)}× (0 = almost no inserted pauses)</label>
              <input id="pauses" type="range" min={0} max={2} step={0.05} value={settings.pauseScale} onChange={(e) => setSettings({ ...settings, pauseScale: Number(e.target.value) })} />
              <label htmlFor="volume">App volume: {Math.round(settings.volume * 100)}% (browser maximum is 100%; louder than that is your device volume)</label>
              <input id="volume" type="range" min={0.2} max={1} step={0.05} value={settings.volume} onChange={(e) => setSettings({ ...settings, volume: Number(e.target.value) })} />
              <button type="button" className="btn btn-teal" onClick={() => player.speak(toSpeechPlan(parseExpression('(x+2)/4'), 'natural'))}>Hear it: (x+2)/4 with these settings</button>
            </div></section>
            <nav className="settings-tools" aria-label="Additional sound tools">
              <button type="button" className="btn" onClick={() => setView('voice-compare')}>Listening comparison</button>
              <button type="button" className="btn" onClick={() => setView('interruption-lab')}>Experimental interruption lab</button>
            </nav>
          </section>
        </RetainedScreen>)}
        {visitedViews.current.has('interaction-settings') && (<RetainedScreen active={view === 'interaction-settings'}>
          <section aria-label="Interaction settings">
            <GlobalConversation player={player} screenName="Interaction settings" conversation={conversation} onText={(t) => void handleGlobalText(t)} />
            <button type="button" className="btn" onClick={() => setView('settings')}>Back to Settings</button>
            <section className="pref-group settings-form" aria-label="How I interact">
              <h2>How I interact</h2>
              <label htmlFor="listening-quiet">Time to pause while speaking</label>
              <select id="listening-quiet" value={listeningQuiet} onChange={(e) => {
                const seconds = Number(e.target.value); setListeningQuiet(seconds);
                try { localStorage.setItem('tiesua-listening-quiet-seconds', String(seconds)); } catch { /* setting remains for this screen */ }
              }}>
                <option value={2}>2 seconds</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option><option value={8}>8 seconds</option>
              </select>
              <label htmlFor="shortcut">Talk keyboard shortcut (optional)</label>
              <select id="shortcut" value={settings.talkShortcut} onChange={(e) => setSettings({ ...settings, talkShortcut: e.target.value as SpeechSettings['talkShortcut'] })}>
                <option value="none">None — Talk button only (safest with screen readers)</option>
                <option value="alt-t">Alt+T to start/stop listening</option>
              </select>
              <label htmlFor="announce">How should TieSua announce readings?</label>
              <select id="announce" value={settings.announceMode} onChange={(e) => setSettings({ ...settings, announceMode: e.target.value as AnnounceMode })}>
                <option value="app-voice">App voice (captions shown, screen-reader announcements quiet)</option>
                <option value="screen-reader">My screen reader (app voice silent, announcements spoken by my reader)</option>
                <option value="both">Both app voice and screen reader</option>
              </select>
              <p className="fineprint">This choice stops the app voice and your screen reader talking over each other. You can change it any time.</p>
            </section>
          </section>
        </RetainedScreen>)}
        {visitedViews.current.has('voice-compare') && <RetainedScreen active={view === 'voice-compare'}><section aria-label="Listening comparison"><GlobalConversation player={player} screenName="Listening comparison" conversation={conversation} onText={(t) => void handleGlobalText(t)} /><button type="button" className="btn" onClick={() => setView('settings')}>Back to Settings</button><VoiceCompare player={player} /></section></RetainedScreen>}
        {visitedViews.current.has('interruption-lab') && <RetainedScreen active={view === 'interruption-lab'}><section aria-label="Experimental interruption lab"><GlobalConversation player={player} screenName="Interruption lab" conversation={conversation} onText={(t) => void handleGlobalText(t)} /><button type="button" className="btn" onClick={() => setView('settings')}>Back to Settings</button><HandsFreeLab player={player} /></section></RetainedScreen>}

        <div className="caption-bar" aria-live={player.livePoliteness} aria-atomic="true">
          {player.caption ? <p><span className="caption-label">{player.preparing ? 'Preparing speech:' : player.speaking ? 'Speaking:' : 'Last said:'}</span> {player.caption}</p> : <p className="caption-empty">What TieSua says will appear here in words.</p>}
        </div>
      </main>

      <aside className="conversation-panel" aria-label="Current conversation" tabIndex={0}>
        <ConversationText label="Last said" text={player.caption || 'TieSua’s words will appear here.'} live={player.livePoliteness} />
        <ConversationText label="Last heard" text={lastHeard || 'Your latest words will appear here.'} />
        <div className="conversation-panel-controls" aria-label="Conversation controls">
          <button type="button" className="conversation-icon-button" onClick={() => player.stop()} disabled={!player.speaking} aria-label="Stop speaking" title="Stop speaking"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg></button>
          <button type="button" className="conversation-icon-button conversation-toggle" aria-pressed={sessionSnap.enabled} onClick={() => conversation.toggle()} aria-label={sessionSnap.enabled ? 'Turn conversation off' : 'Turn conversation on'} title={sessionSnap.enabled ? 'Conversation on — turn off' : 'Conversation off — turn on'}><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>{!sessionSnap.enabled && <path d="M4 4l16 16"/>}</svg></button>
        </div>
      </aside>

      <nav className="dock" aria-label="TieSua main navigation">
        {nav('home', 'Home', view === 'home')}
        {nav('lessons', 'Lessons', view === 'lessons' || view === 'lesson')}
        {nav('explore', 'Explore', view === 'explore')}
        {nav('settings', 'Settings', view === 'settings' || view === 'sound-settings' || view === 'interaction-settings' || view === 'voice-compare' || view === 'interruption-lab')}
      </nav>
    </div>
  );
}
