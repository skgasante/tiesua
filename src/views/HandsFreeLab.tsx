import { useCallback, useEffect, useRef, useState } from 'react';
import { HandsFreeController, type HandsFreeState } from '../speech/handsFree';
import { BrowserRecognition, recognitionSupported } from '../speech/recognition';
import { classifyRequest } from '../conversation/intentEngine';
import type { SpeechPlan } from '../speech/speechPlan';
import type { useSpeech } from '../speech/useSpeech';

type Player = ReturnType<typeof useSpeech>;
const textPlan = (text: string): SpeechPlan => ({ mode: 'natural', segments: [{ id: 'c', nodeId: 'c', text, pauseAfterMs: 0, boundary: 'none' }] });

const LONG_EXPLANATION = 'Let us talk about the denominator slowly. When we break one whole thing into equal pieces, the denominator tells us how many pieces we made. If a chocolate bar breaks into four equal pieces, the denominator is four. The numerator then tells us how many of those pieces we pick up. Two over four means we pick up two of the four pieces. Take your time and think about the chocolate bar while I explain this once more in another way.';

interface LogEntry { at: string; event: string }

/** Isolated hands-free barge-in experiment. Explicitly enabled per
 * session; push-to-talk elsewhere is untouched. This lab stops app
 * speech on detected learner onset and captures the statement with
 * the ordinary recognition path - it does not ship as the default. */
export function HandsFreeLab({ player }: { player: Player }) {
  const [hfState, setHfState] = useState<HandsFreeState>('off');
  const [preset, setPreset] = useState<'headphones' | 'speakers'>('headphones');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [transcript, setTranscript] = useState('');
  const [meaning, setMeaning] = useState('');
  const controllerRef = useRef<HandsFreeController | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const recognisingRef = useRef(false);
  const supported = recognitionSupported() && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const addLog = useCallback((event: string) => {
    setLog((entries) => [...entries.slice(-11), { at: new Date().toLocaleTimeString(), event }]);
  }, []);

  const startRecognition = useCallback(() => {
    if (recognisingRef.current) return;
    recognisingRef.current = true;
    const recognition = new BrowserRecognition();
    recognitionRef.current = recognition;
    const started = recognition.start({
      onTranscript: (text, isFinal) => {
        if (!isFinal) return;
        recognisingRef.current = false;
        setTranscript(text);
        const intent = classifyRequest(text, true);
        setMeaning(intent.kind === 'actions' ? `Understood as: ${intent.actions.map((a) => a.name).join(', ')}` : intent.kind === 'math' ? 'Understood as a mathematics step (would go to the checker).' : intent.kind === 'question' ? 'Understood as a question (would go to the tutor).' : 'Not matched locally - would go to Meta interpretation or a clarification.');
        addLog(`Heard: "${text}"`);
        controllerRef.current?.resumeWatching();
      },
      onEnd: () => {
        if (recognisingRef.current) {
          recognisingRef.current = false;
          addLog('Recognition ended with no words - the first sounds may have been missed. In the lesson, TieSua would ask you to say it once more.');
          controllerRef.current?.resumeWatching();
        }
      },
    });
    if (!started) {
      recognisingRef.current = false;
      addLog('Recognition could not start in this browser.');
      controllerRef.current?.resumeWatching();
    }
  }, [addLog]);

  const enable = useCallback(async () => {
    if (!controllerRef.current) {
      controllerRef.current = new HandsFreeController({
        onState: (s) => setHfState(s),
        onOnset: () => {
          const t0 = performance.now();
          const wasSpeaking = player.speaking;
          player.stop();
          const stopMs = Math.max(1, Math.round(performance.now() - t0));
          addLog(wasSpeaking
            ? `Learner speech detected - speech stop requested in ${stopMs} ms. Now listening for the full statement.`
            : 'Learner started speaking - listening (TieSua was not speaking).');
          startRecognition();
        },
      }, preset);
    }
    controllerRef.current.setPreset(preset);
    const ok = await controllerRef.current.start();
    addLog(ok ? 'Hands-free watching started. The microphone is live only for this experiment.' : 'Microphone was not allowed, or none is available. Nothing is listening.');
  }, [addLog, player, preset, startRecognition]);

  const disable = useCallback(() => {
    recognitionRef.current?.stop();
    recognisingRef.current = false;
    controllerRef.current?.stop();
    addLog('Hands-free stopped. Microphone released.');
  }, [addLog]);

  useEffect(() => () => { controllerRef.current?.stop(); recognitionRef.current?.stop(); }, []);

  return (
    <div>
      <p><strong>Experimental:</strong> talk over TieSua and it should stop and listen - no Talk button. This is a test bench, not the normal lesson mode. Use headphones if you can; loudspeakers may let TieSua hear itself, and this lab exists to measure exactly that.</p>
      <p role="status">State: {hfState === 'off' ? 'Not listening' : hfState === 'watching' ? 'Watching for your voice' : 'Interrupted - listening to you'}.</p>
      <div className="btn-row">
        <label>
          Listening setup{' '}
          <select value={preset} onChange={(e) => { const p = e.target.value as 'headphones' | 'speakers'; setPreset(p); controllerRef.current?.setPreset(p); }}>
            <option value="headphones">Headphones (more sensitive)</option>
            <option value="speakers">Laptop speakers (less sensitive)</option>
          </select>
        </label>
      </div>
      <div className="btn-row">
        {hfState === 'off'
          ? <button type="button" className="btn btn-teal" onClick={() => void enable()} disabled={!supported}>Start hands-free experiment</button>
          : <button type="button" className="btn" onClick={disable}>Stop listening and release microphone</button>}
        <button type="button" className="btn" onClick={() => player.speak(textPlan(LONG_EXPLANATION))}>Play a long explanation (then talk over it)</button>
        <button type="button" className="btn" onClick={() => player.stop()}>Stop speaking</button>
      </div>
      {!supported && <p className="fineprint">This browser cannot run the experiment (microphone capture or speech recognition is unavailable). Push-to-talk and typing are unaffected.</p>}
      {transcript && <p><strong>Last interruption heard:</strong> "{transcript}"</p>}
      {meaning && <p>{meaning}</p>}
      {log.length > 0 && (
        <ol aria-label="Experiment event log">
          {log.map((entry, i) => <li key={i}>{entry.at} - {entry.event}</li>)}
        </ol>
      )}
    </div>
  );
}
