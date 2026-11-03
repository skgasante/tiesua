import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserSpeechProvider } from './provider';
import { planText, type SpeechPlan } from './speechPlan';
import { spokenWording } from './spokenWording';

export type AnnounceMode = 'app-voice' | 'screen-reader' | 'both';

export interface SpeechSettings {
  rate: number;
  pauseScale: number;
  volume: number;
  textSize: number;
  voiceURI: string;
  announceMode: AnnounceMode;
  talkShortcut: 'none' | 'alt-t';
}

const provider = new BrowserSpeechProvider();

/** Playback controller with genuine stop/replay. Announcement
 * strategy avoids app TTS and screen-reader speech talking over
 * each other: in app-voice mode the caption is visual-only
 * (aria-live off); in screen-reader mode TTS stays silent and the
 * caption is a polite live region; "both" is the learner's choice. */
export function useSpeech(settings: SpeechSettings) {
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const activeSpeech = useRef(false);
  const activityListener = useRef<((active: boolean) => void) | null>(null);
  const setActivityListener = useCallback((listener: ((active: boolean) => void) | null) => {
    activityListener.current = listener;
    listener?.(activeSpeech.current);
  }, []);
  const speechGeneration = useRef(0);
  const [caption, setCaption] = useState('');
  const [timing, setTiming] = useState<{ firstSegmentMs: number | null; totalMs: number | null }>({ firstSegmentMs: null, totalMs: null });
  const startedAt = useRef(0);
  const lastPlan = useRef<SpeechPlan | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const stop = useCallback(() => { speechGeneration.current += 1; activeSpeech.current = false; provider.stop(); activityListener.current?.(false); setSpeaking(false); setPreparing(false); }, []);

  const [renderStyle, setRenderStyle] = useState<'phrase' | 'legacy'>('phrase');

  const speak = useCallback((plan: SpeechPlan, legacy = false, overrides: { voiceURI?: string; rate?: number; pauseScale?: number; volume?: number; startTimeoutMs?: number } = {}) => {
    const generation = ++speechGeneration.current;
    const spokenPlan = { ...plan, segments: plan.segments.map((segment) => ({ ...segment, text: spokenWording(segment.text) })) };
    lastPlan.current = spokenPlan;
    setRenderStyle(legacy ? 'legacy' : 'phrase');
    setCaption(planText(spokenPlan));
    const s = settingsRef.current;
    if (s.announceMode === 'screen-reader' || !provider.isSupported()) {
      activeSpeech.current = false;
      provider.stop(); activityListener.current?.(false);
      setSpeaking(false); setPreparing(false);
      return;
    }
    activeSpeech.current = true;
    // Suspend capture synchronously, before React renders or audio is queued.
    activityListener.current?.(true);
    setSpeaking(true); setPreparing(true);
    startedAt.current = performance.now();
    setTiming({ firstSegmentMs: null, totalMs: null });
    let first = true;
    provider.speak(spokenPlan, {
      legacy, startTimeoutMs: overrides.startTimeoutMs,
      onFailure: () => { if (generation === speechGeneration.current) stop(); },
      rate: overrides.rate ?? s.rate, pauseScale: overrides.pauseScale ?? s.pauseScale,
      volume: overrides.volume ?? s.volume, voiceURI: overrides.voiceURI ?? (s.voiceURI || undefined),
      onStarted: () => { if (generation === speechGeneration.current) setPreparing(false); },
      onSegment: () => { if (first) { first = false; setTiming((t) => ({ ...t, firstSegmentMs: Math.round(performance.now() - startedAt.current) })); } },
      onDone: () => { if (generation !== speechGeneration.current) return; activeSpeech.current = false; activityListener.current?.(false); setSpeaking(false); setPreparing(false); setTiming((t) => ({ ...t, totalMs: Math.round(performance.now() - startedAt.current) })); },
    });
  }, [stop]);

  const replay = useCallback(() => { if (lastPlan.current) speak(lastPlan.current); }, [speak]);

  useEffect(() => () => stop(), [stop]);

  const livePoliteness: 'off' | 'polite' = settings.announceMode === 'app-voice' ? 'off' : 'polite';

  const speakLegacy = useCallback((plan: SpeechPlan) => speak(plan, true), [speak]);

  return { setActivityListener, speaking, preparing, generation: () => speechGeneration.current, isSpeaking: () => activeSpeech.current, caption, speak, speakLegacy, stop, replay, livePoliteness, provider, timing, renderStyle };
}
