/** @vitest-environment jsdom */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import App from './App';
import { api } from './learn/api';
import { PROBLEMS } from './learn/problems';
import { LESSONS } from './lessons/catalogue';
import { EQUATION_JOURNEY, TEACHING_STEP_COUNT, BOX_STORY_START } from './lessons/equationJourney';
import { saveSnapshot } from './lessons/resume';
import { clearLifecycleEvents, getLifecycleEvents, setLifecycleLogEnabled } from './speech/lifecycleLog';

const calls = vi.hoisted(() => ({ probePlan: null as any, failService: 0, serviceMode: 'throw', turns: [] as string[], resolve: null as null | ((result: any) => void), openingResolve: null as null | ((result: any) => void), delayOpening: false, port: 0, dropNext: false, trace: [] as { at: string; kind: string; detail: string }[], python: '', env: {} as Record<string, string> }));
vi.mock('./learn/api', () => ({
  api: {
    orchestrate: vi.fn(async (text: string, context?: Record<string, any>) => {
      calls.turns.push(text);
      if (text === "I would love to keep the last voice") return { source: "mock", actions: [{ name: "speech.previewVoice", args: { direction: "keep" } }], reply: "Keeping that voice." };
      if (text === 'cancel my voice change') return { source: 'mock', actions: [{ name: 'speech.stop', args: {} }] };
      if (text === 'return to my original voice') return { source: 'mock', actions: [{ name: 'speech.previewVoice', args: { direction: 'previous' } }] };
      if (text.startsWith("settings probe ")) return calls.probePlan;
      if (text === "are you calling me making sure everyone get the same number of sweets") return { source: "mock", stepAssessment: "correct", actions: [{ name: "lesson.continue", args: {} }], teachingMove: "none", reply: "Yes, exactly. Equally means each friend gets the same number." };
      if (text === "when was in the box two was added then it became twelve so ten fits") return { source: "mock", stepAssessment: "correct", actions: [], teachingMove: "none", reply: "Yes well done. Ten plus two is twelve, and twelve shared by four is three." };
      if (text === 'Can we go back to the previous part?') return { source: 'mock', actions: [{ name: 'lesson.reviewPrevious', args: {} }], teachingMove: 'none', reply: '' };
      if (["let's pick up where we left off", 'Can we carry on from last time?', 'Back to my lesson please'].includes(text)) {
        const option = context?.pending_options?.find((o: any) => o.id === 'resume');
        expect(option?.action).toEqual({ name: 'lesson.openLesson', args: { query: 'equations-fraction' } });
        return { source: 'mock', actions: [text.startsWith("let's") ? { name: 'lesson.continue', args: {} } : option.action], teachingMove: 'none', reply: '' };
      }
      if (text === 'We undid the division') return { source: 'mock', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'none', stepAssessment: 'correct', reply: 'Yes.' };
      if (['Why did we multiply both sides?', 'I am still confused about the fraction'].includes(text)) {
        expect(context?.completed_example?.original_equation).toBe('(x+2)/4 = 3');
        return { source: 'mock', actions: [{ name: 'lesson.morePractice', args: { mode: 'guided' } }], teachingMove: 'guided-example',
          reply: 'Multiplying both sides by four undoes division by four and keeps the two sides equal. What part would you like to discuss?' };
      }
      if (text === "yeah that's what I said") return { source: 'mock', actions: [], teachingMove: 'none',
        reply: 'Well done. You said twelve sweets shared among four friends, three each.', continuation: 'await-response' };
      if (text === 'twelve sweets shared among four friends with three each') return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: 'correct', reply: 'Yes.' };
      if (["let's start all over", "let's tattoo all over"].includes(text)) return { source: 'mock', actions: [{ name: 'lesson.restart', args: {} }], teachingMove: 'none', reply: '' };
      if (context?.teaching_step?.question?.includes('Can you tell me what happened in your own words?')
          && ['three', '12', 'four friends', 'four friends shared and each got three', 'loop answer'].includes(text)) {
        const prior = context.step_conversation?.recent_turns ?? [];
        const evidence = [...prior.map((turn: any) => turn.learner), text].join(' ');
        const complete = /12/.test(evidence) && /four friends/.test(evidence) && /three/.test(evidence);
        return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: complete ? 'correct' : 'partial',
          reply: complete ? 'Yes. Those answers describe our sharing.' : 'How many sweets did we start with, and how many friends shared them?' };
      }
      if (text === 'the right hand side but wait can you slow down just a bit' || text === 'four sweets but can you slow down?') return {
        source: 'mock', actions: [{ name: 'speech.setRate', args: { delta: -0.2 } }, { name: 'lesson.continue', args: {} }],
        stepAssessment: 'correct', interpretedAnswer: text.startsWith('four') ? { value: 4, confidence: .99, purpose: 'answer' } : null,
        teachingMove: 'continue', reply: 'I will use a slower pace as we carry on with the next part of the lesson.'
      };
      if (text === 'Please speak more slowly') return { source: 'mock', actions: [{ name: 'speech.setRate', args: { delta: -.2 } }], teachingMove: 'none', reply: '' };
      if (text === 'oh this sweets before I Shelly') return { source: 'clarification', actions: [], teachingMove: 'none', reply: '', clarification: "I didn't quite catch that. Could you please say it again?" };
      if (text === 'two sweets were added') {
        if (calls.failService > 0) {
          calls.failService--;
          if (calls.serviceMode === 'throw') throw new Error('simulated transport failure');
          return { source: 'unavailable', actions: [], teachingMove: 'none', diagnostics: { note: 'ReadTimeout' }, clarification: 'Could not get a response.' };
        }
        return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: 'correct', reply: 'Yes. Two sweets were added first.' };
      }
      if (text === 'fore') return { source: 'mock', actions: [], teachingMove: 'none', interpretedAnswer: { value: 4, confidence: 0.97, purpose: 'answer' }, reply: '' };
      if (text === 'ate') return { source: 'mock', actions: [], teachingMove: 'none', interpretedAnswer: { value: 8, confidence: 0.97, purpose: 'answer' }, reply: '' };
      if (context?.verified_result?.action_type === 'operation') return { source: 'mock', actions: [], teachingMove: 'ask-check', reply: 'You have applied the same operation to both sides.', continuation: 'await-response' };
      if (context?.verified_result?.verdict === 'invalid') return { source: 'mock', actions: [], teachingMove: 'ask-check', reply: `That step does not keep the same solution. ${context.current_question}`, continuation: 'await-response' };
      if (text === 'I want to study') return { source: 'mock', actions: [{ name: 'help.offerLessons', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'How does TieSua work?') return { source: 'mock', actions: [{ name: 'help.guide', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'Could you say that once more?') return { source: 'mock', actions: [{ name: 'speech.repeatCurrent', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'Please give me a little more time') return { source: 'mock', actions: [{ name: 'conversation.wait', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'Yes, let us move on') return { source: 'mock', actions: [{ name: 'help.tutorialNext', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'I would like to start studying') return { source: 'mock', actions: [{ name: 'help.offerLessons', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'Can I type instead?') return { source: 'mock', actions: [], teachingMove: 'none', reply: 'Yes. The keyboard button opens a place to type. Would you like to continue?', continuation: 'await-response' };
      if (text.startsWith('Begin this lesson')) {
        expect(context?.opening_brief).toBe(LESSONS[0].intro.join(' '));
        expect(context?.opening_brief).not.toContain('like sharing sweets');
      }
      if (calls.delayOpening && text.startsWith('Begin this lesson')) return new Promise<any>(resolve => { calls.openingResolve = resolve; });
      if (text === 'continue') return { source: 'mock', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'I want to continue') return { source: 'mock', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'continue', reply: 'Let us stay on this step. How many is that altogether?', continuation: 'await-response' };
      if (text === 'I am giving the sweets out') return { source: 'mock', actions: [], teachingMove: 'none', reply: 'You are sharing them out. How many sweets have you given away?', continuation: 'await-response' };
      if (text === 'Could you explain more?') return { source: 'mock', actions: [], teachingMove: 'explain-differently', reply: 'Let us break this idea into smaller parts. What part would you like to discuss?', continuation: 'await-response' };
      if (text === 'misrouted check') return { source: 'mock', actions: [], teachingMove: 'ask-check', reply: '', continuation: 'await-response' };
      if (text === 'Twelve divided by four.') return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: 'correct', reply: 'Exactly.' };
      if (text === 'everyone gets the same number') return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: 'correct', reply: 'Exactly.' };
      if (text === 'the number of friends') return { source: 'mock', actions: [], teachingMove: 'none', stepAssessment: 'correct', reply: 'Yes, four friends.' };
      if (text.startsWith('understood step ')) return { source: 'mock', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'none', reply: 'That is right.' };
      if (text === 'I understand now') return { source: 'mock', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'I am lost') return { source: 'mock', actions: [], teachingMove: 'hint', reply: 'Let us take it slowly. What operation undoes dividing by three?', continuation: 'await-response' };
      if (['Could we do fractions instead?', 'I would rather learn fractions', 'Please take me to parts of a whole', 'Can we switch to fractions?', 'I want to try the other lesson'].includes(text)) return { source: 'mock', actions: [{ name: 'lesson.openLesson', args: { query: text === 'Could we do fractions instead?' ? 'fractions-parts' : 'Parts of a Whole' } }], teachingMove: 'none', reply: 'Let us switch.' };
      if (['Could we learn equations instead?', 'I would like the equations lesson'].includes(text)) return { source: 'mock', actions: [{ name: 'lesson.openLesson', args: { query: 'Solving Equations with a Fraction' } }], teachingMove: 'none', reply: 'Let us switch.' };
      if (['Take me back home please', 'I would like to go home now', 'Can we leave and go home?', 'Please return me to the home screen'].includes(text)) return { source: 'mock', actions: [{ name: 'nav.goHome', args: {} }], teachingMove: 'none', reply: 'Going home.' };
      if (text === 'Yes, switch lessons please') return { source: 'mock', actions: [{ name: 'confirmation.accept', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'Actually I would rather stay') return { source: 'mock', actions: [{ name: 'confirmation.decline', args: {} }], teachingMove: 'none', reply: '' };
      if (text === 'What would happen if we went home?') return { source: 'mock', actions: [{ name: 'nav.goHome', args: {} }], teachingMove: 'none', reply: 'I can take you home.' };
      if (text === 'What if I switched to fractions later?') return { source: 'mock', actions: [{ name: 'lesson.openLesson', args: { query: 'fractions-parts' } }], teachingMove: 'none', reply: 'Opening fractions.' };
      if (text === 'Please do not take me home') return { source: 'mock', actions: [{ name: 'nav.goHome', args: {} }], teachingMove: 'none', reply: 'Going home.' };
      if (text === 'Let us practise together' || text === 'Can we practise a different example together?') return { source: 'mock', learnerPurpose: 'request', actions: [{ name: 'lesson.morePractice', args: { mode: 'guided' } }], teachingMove: 'guided-example', reply: '' };
      if (text === 'I need more time to think') return { source: 'mock', actions: [{ name: 'conversation.wait', args: {} }], teachingMove: 'none', reply: 'Take your time.', continuation: 'await-response' };
      if (text === 'Where are we?') return { source: 'mock', actions: [{ name: 'lesson.recap', args: {} }], teachingMove: 'none', reply: '', continuation: 'await-response' };
      if (text === 'I need help with multiplication') return { source: 'mock', actions: [], teachingMove: 'explain-prerequisite', reply: '', continuation: 'await-response' };
      if (text === 'I want to stop for today') return { source: 'mock', actions: [{ name: 'conversation.end', args: {} }], teachingMove: 'none', reply: 'We will stop here.', continuation: 'close' };
      if (text === 'I am finished for today') return { source: 'mock', actions: [], teachingMove: 'none', reply: 'We will stop here.', continuation: 'close' };
      if (text === 'please Michelle') return { source: 'live-meta', actions: [], teachingMove: 'none', reply: 'What would you like to do next?', continuation: 'await-response' };
      if (text === "yes please let's do that") return { source: 'live-meta', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'guided-example', reply: 'Let us try another example.', continuation: 'await-response' };
      if (text === "yeah I'm already") return { source: 'live-meta', actions: [], teachingMove: 'guided-example', reply: 'Let us try another example.', continuation: 'await-response' };
      if (text === "yes I'm ready") return { source: 'live-meta', actions: [{ name: 'lesson.morePractice', args: { mode: 'independent' } }], teachingMove: 'independent-practice', reply: 'Try one on your own.', continuation: 'await-response' };
      if (text === 'Why multiply by four?') return { source: 'live-meta', actions: [{ name: 'lesson.continue', args: {} }], teachingMove: 'continue', reply: 'Multiplying by four undoes division by four. Would you like to continue or ask another question?', continuation: 'await-response' };
      if (text === 'Explain the denominator') return { source: 'live-meta', actions: [{ name: 'lesson.explainPart', args: { part: 'denominator' } }], teachingMove: 'revisit-part', reply: 'In three over five, five counts all the equal parts. What is the denominator?', continuation: 'await-response' };
      if (text === 'delayed response') return new Promise<any>(resolve => { calls.resolve = resolve; });
      if (text === 'I have finished the lesson.') return { source: 'mock', actions: [{ name: 'lesson.nextLesson', args: {} }], teachingMove: 'none', reply: 'Well done.', continuation: 'await-response' };
      if (text === 'multiply by four') return { source: 'mock', actions: [], teachingMove: 'none', reply: 'What equation do you get after multiplying both sides by four?', continuation: 'await-response' };
      if (text === 'multiply by five') return { source: 'mock', actions: [], teachingMove: 'none', reply: 'What equation do you get after doing that to both sides??', continuation: 'await-response' };
      if (text.startsWith('open ')) return { source: 'mock', actions: [{ name: 'lesson.openLesson', args: { query: text.slice(5) } }], teachingMove: 'none', reply: '' };
      return { source: 'mock', actions: [], teachingMove: 'none', reply: 'Let us begin. When you are ready, say continue.', continuation: 'await-response' };
    }),
    createSession: vi.fn(async (problem: string) => {
      const body = JSON.stringify({ problem });
      const raw = execFileSync(calls.python, ['-c', 'import sys,urllib.request; r=urllib.request.Request(sys.argv[1],data=sys.argv[2].encode(),headers={"Content-Type":"application/json"}); print(urllib.request.urlopen(r,timeout=5).read().decode())', `http://127.0.0.1:${calls.port}/v1/sessions`, body], { env: calls.env, encoding: 'utf8', windowsHide: true });
      return JSON.parse(raw);
    }),
    getSession: vi.fn(async (session: string) => {
      const raw = execFileSync(calls.python, ['-c', 'import sys,urllib.request; print(urllib.request.urlopen(sys.argv[1],timeout=5).read().decode())', `http://127.0.0.1:${calls.port}/v1/sessions/${session}`], { env: calls.env, encoding: 'utf8', windowsHide: true });
      return JSON.parse(raw);
    }),
    submitStep: vi.fn(async (session: string, input: string) => {
      const body = JSON.stringify({ input });
      const raw = execFileSync(calls.python, ['-c', 'import sys,urllib.request; r=urllib.request.Request(sys.argv[1],data=sys.argv[2].encode(),headers={"Content-Type":"application/json"}); print(urllib.request.urlopen(r,timeout=5).read().decode())', `http://127.0.0.1:${calls.port}/v1/sessions/${session}/step`, body], { env: calls.env, encoding: 'utf8', windowsHide: true });
      const result = JSON.parse(raw);
      if (calls.dropNext) { calls.dropNext = false; throw new Error('simulated lost response'); }
      calls.trace.push({ at: new Date().toISOString(), kind: 'verifier.result', detail: `${result.action_type} ${result.verdict}; equation ${result.state.equation_text}; pending ${result.state.pending_operation}` });
      return result;
    }),
  },
  tutorSourceLabel: () => '',
}));

type ResultEvent = { results: Array<{ 0: { transcript: string }; isFinal: boolean }> };
class Recognition {
  static active: Recognition | null = null;
  static failNext = false;
  onresult: ((e: ResultEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  start() { if (Recognition.failNext) { Recognition.failNext = false; throw new Error('unavailable'); } Recognition.active = this; }
  stop() { if (Recognition.active === this) Recognition.active = null; }
  final(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true }] }); }
}
class Utterance {
  text: string; rate = 1; volume = 1; pitch = 1; voice = null;
  onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}
const spoken: { at: number; text: string; rate: number; voice?: string }[] = [];
let generation = 0;
let holdExample = false;
let held: Utterance | null = null;
const synth = {
  cancel() { generation++; }, getVoices() { return []; }, addEventListener() {}, removeEventListener() {},
  speak(u: Utterance) { const g = generation; spoken.push({ at: Date.now(), text: u.text, rate: u.rate, voice: (u as any).voice?.voiceURI }); (u as any).onstart?.(); if (holdExample && u.text.includes('What do you think equally means?')) { held = u; return; } setTimeout(() => { if (g === generation) u.onend?.(); }, 100); },
};
const advance = async (ms: number) => { while (ms > 0) { const step = Math.min(ms, 50); await act(async () => { await vi.advanceTimersByTimeAsync(step); }); ms -= step; } };
const answer = async (text: string) => { calls.trace.push({ at: new Date().toISOString(), kind: 'simulator.final', detail: text }); expect(Recognition.active).not.toBeNull(); await act(async () => { Recognition.active!.final(text); }); await advance(3000); };
const click = async (selector: string) => { const el = document.querySelector<HTMLButtonElement>(selector); expect(el).not.toBeNull(); await act(async () => el!.click()); };
const settle = async () => { for (let i = 0; i < 12; i++) await advance(250); };
// Complete the teaching journey with simulated model decisions for conceptual answers.
// Numeric answers still pass through the production deterministic checker.
const completeTeachingJourney = async () => {
  await answer('continue'); await settle();
  for (let i = 0; i < TEACHING_STEP_COUNT; i++) {
    const step = EQUATION_JOURNEY[i];
    await answer(step.numericAnswer === undefined ? `understood step ${i}` : String(step.numericAnswer));
    await settle();
    if (i < TEACHING_STEP_COUNT - 1) {
      expect(spoken.at(-1)?.text).toContain(EQUATION_JOURNEY[i + 1].prompt);
    } else {
      expect(spoken.at(-1)?.text).toContain('You can ask me any questions');
    }
    expect(Recognition.active).not.toBeNull();
  }
};

describe('mounted app voice lifecycle', () => {
  it.each([
    { saved: null, migrated: false, expected: 0.8 },
    { saved: 1.15, migrated: false, expected: 0.8 },
    { saved: 0.95, migrated: true, expected: 0.95 },
  ])('uses the slower baseline and preserves later speed choices: $saved / $migrated', async ({ saved, migrated, expected }) => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); sessionStorage.clear();
    if (saved !== null) localStorage.setItem('tiesua-settings', JSON.stringify({ rate: saved, volume: 0.7 }));
    if (migrated) localStorage.setItem('tiesua-rate-default-version', '1');
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      const settings = JSON.parse(localStorage.getItem('tiesua-settings')!);
      expect(settings.rate).toBe(expected);
      if (saved !== null) expect(settings.volume).toBe(0.7);
      expect(localStorage.getItem('tiesua-rate-default-version')).toBe('1');
    } finally { await act(async () => root.unmount()); }
  });
  let server: ChildProcess;
  beforeAll(async () => {
    const socket = createServer();
    await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const address = socket.address();
    if (!address || typeof address === 'string') throw new Error('Could not reserve a local verifier port');
    calls.port = address.port;
    await new Promise<void>((resolve, reject) => socket.close((err) => err ? reject(err) : resolve()));
    // Give the subprocess only OS startup variables and test flags, not owner credentials.
    const env: Record<string, string> = { TIESUA_TUTOR_MOCK: '1', TIESUA_DISABLE_LIVE_AI: '1' };
    for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'PATH']) if (process.env[key]) env[key] = process.env[key]!;
    const python = process.platform === 'win32' ? join(process.cwd(), '.venv', 'Scripts', 'python.exe') : join(process.cwd(), '.venv', 'bin', 'python');
    calls.python = python; calls.env = env;
    server = spawn(python, ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', String(calls.port)], { env, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) break;
      try { if ((await fetch(`http://127.0.0.1:${calls.port}/health`)).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) { server.kill(); throw new Error('Isolated mock verifier did not start'); }
  }, 15000);
  afterAll(() => { server?.kill(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

  const settingsProbes = [
    ['speech.setRate', { delta: -0.2 }], ['speech.setRate', { delta: 0.2 }],
    ['speech.setRate', { value: 0.7 }], ['speech.setRate', { value: 1.4 }],
    ['speech.setPauses', { value: 1.5 }], ['speech.setPauses', { value: 0.5 }],
    ['speech.setVolume', { value: 0.4 }], ['speech.setVolume', { value: 0.8 }],
    ['display.setTextSize', { value: 125 }], ['display.setTextSize', { value: 150 }],
    ['speech.previewVoice', { direction: 'descriptor', descriptor: "man's voice" }],
    ['speech.previewVoice', { direction: 'descriptor', descriptor: 'female voice' }],
  ] as const;
  it.each(['early', 'box', 'reflection', 'choice', 'complete'].flatMap(stage => settingsProbes.map(([name, args], i) => ({ stage, name, args, i }))))
  ('executes settings without replacing content: $stage / $name / $i', async ({ stage, name, args, i }) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    const available = [
      { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'female' },
      { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'male' },
    ];
    vi.spyOn(synth, 'getVoices').mockReturnValue(available as any);
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const index = stage === 'early' ? 0 : stage === 'box' ? BOX_STORY_START : TEACHING_STEP_COUNT - 2;
    saveSnapshot({ lessonId: 'equations-fraction', stage: stage === 'choice' || stage === 'complete' ? stage : 'example',
      exampleStep: index, exampleVersion: 4, itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      const main = document.querySelector('.mn-say')?.textContent;
      const math = document.querySelector('.mn-math')?.textContent;
      const heading = document.querySelector('#lesson-heading')?.textContent;
      const baselineRate = spoken.at(-1)?.rate ?? 1.15;
      const start = spoken.length;
      calls.probePlan = { source: 'mock', actions: [{ name, args }], teachingMove: 'none',
        reply: "Let me find a man's voice for you to hear.", continuation: 'await-response' };
      await answer(`settings probe ${stage} ${i}`); await settle();
      expect(document.querySelector('.mn-say')?.textContent).toBe(main);
      expect(document.querySelector('.mn-math')?.textContent).toBe(math);
      expect(document.querySelector('#lesson-heading')?.textContent).toBe(heading);
      const output = spoken.slice(start);
      expect(output.length).toBeGreaterThan(0);
      expect(output.some(s => s.text.includes('Let me find'))).toBe(false);
      if (name === 'speech.previewVoice') {
        const selected = i === 10 ? 'male' : 'female';
        expect(output.at(-1)?.voice).toBe(selected);
        const beforeKeep = spoken.length;
        await answer('I would love to keep the last voice'); await settle();
        const confirmation = spoken.slice(beforeKeep);
        expect(confirmation.every(s => s.voice === selected)).toBe(true);
        expect(confirmation.at(-1)?.text).toMatch(/\?|tell me/i);
        expect(document.querySelector('.mn-say')?.textContent).toBe(main);
      }
      if (name === 'speech.setRate') {
        const target = 'value' in args ? args.value : baselineRate + ('delta' in args ? args.delta : 0);
        expect(output.at(-1)?.rate).toBeCloseTo(target);
      }
      expect(Recognition.active).not.toBeNull();
    } finally { calls.probePlan = null; await act(async () => root.unmount()); }
  });


  it.each(['home', 'lesson'].flatMap(screen => ['I would love to keep the last voice', 'cancel my voice change', 'return to my original voice'].map(command => ({screen, command}))))
  ('restores the interrupted full instruction after preview: $screen / $command', async ({screen, command}) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    vi.spyOn(synth, 'getVoices').mockReturnValue([
      { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'female' },
      { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'male' },
    ] as any);
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      if (screen === 'lesson') { await answer('open Solving Equations with a Fraction'); await settle(); }
      const instruction = spoken.at(-1)!.text;
      const main = document.querySelector('.mn-say')?.textContent;
      calls.probePlan = { source: 'mock', actions: [{ name: 'speech.previewVoice', args: { direction: 'descriptor', descriptor: 'male' } }], teachingMove: 'none', reply: '' };
      await answer('settings probe preview'); await settle();
      expect(spoken.at(-1)!.text).toContain('only matching voice');
      const before = spoken.length;
      await answer(command); await settle();
      const restored = spoken.slice(before).map(s => s.text).join(' ');
      expect(restored).toContain('Back to where we were.');
      expect(restored).toContain(instruction.replace(/^Welcome (?:back|once again)[.!]\s*/i, ''));
      expect(restored).toMatch(command.includes('keep') ? /Keeping that voice/ : command.includes('cancel') ? /cancelled/ : /original voice/);
      if (screen === 'lesson') expect(document.querySelector('.mn-say')?.textContent).toBe(main);
      expect(Recognition.active).not.toBeNull();
    } finally { calls.probePlan = null; await act(async () => root.unmount()); }
  });

  it.each(['when was in the box two was added then it became twelve so ten fits', 'are you calling me making sure everyone get the same number of sweets'])('continues after an assessed conceptual answer despite a question-like transcription: %s', async utterance => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const index = utterance.startsWith('are') ? 0 : EQUATION_JOURNEY.findIndex(s => s.title === 'We found the starting number');
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', exampleStep: index, exampleVersion: 4,
      itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await answer(utterance); await settle();
    expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[index + 1].prompt);
    if (index > 0) expect(document.querySelector('.mn-math')?.textContent).toContain('3');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('shows preparation until delayed browser playback starts and keeps capture off throughout', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); Recognition.active = null; generation++;
    vi.spyOn(synth, 'speak').mockImplementation(u => {
      const g = generation;
      setTimeout(() => { if (g === generation) (u as any).onstart?.(); }, 3000);
      setTimeout(() => { if (g === generation) u.onend?.(); }, 5000);
    });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(1500);
    expect(document.querySelector('.mn-status')?.textContent).toBe('Preparing speech');
    expect(Recognition.active).toBeNull();
    await advance(2500);
    expect(document.querySelector('.mn-status')?.textContent).toBe('Speaking');
    expect(Recognition.active).toBeNull();
    await advance(2000);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });

  it.each([false, true])('attempts opening guidance without duplicate welcomes, returning=%s', async (returning) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; calls.turns.length = 0; Recognition.active = null; generation++;
    if (returning) localStorage.setItem('tiesua-visited', '1');
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await advance(1500);
    expect(spoken.filter(s => s.text.startsWith('Select the microphone'))).toHaveLength(1);
    expect(spoken.some(s => /welcome/i.test(s.text))).toBe(false);
    expect(Recognition.active).toBeNull();
    expect(calls.turns).toHaveLength(0);
    expect(document.querySelector('[aria-label="Start hands-free conversation"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Start learning');
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    expect(Recognition.active).not.toBeNull();
    expect(spoken.some(s => s.text.includes('Would you like to study'))).toBe(true);
    expect(spoken.filter(s => /Welcome back/i.test(s.text))).toHaveLength(returning ? 1 : 0);
    await act(async () => root.unmount());
  });

  it.each([
    ['Could we do fractions instead?', 'lesson'], ['I would rather learn fractions', 'lesson'],
    ['Please take me to parts of a whole', 'lesson'], ['Can we switch to fractions?', 'lesson'],
    ['I want to try the other lesson', 'lesson'], ['Take me back home please', 'home'],
    ['I would like to go home now', 'home'], ['Can we leave and go home?', 'home'],
    ['Please return me to the home screen', 'home'],
  ])('confirms an unfinished problem before executing "%s"', async (utterance, destination) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('Can we practise a different example together?'); await settle();
    expect(document.body.textContent).toContain('together');
    await answer('multiply by five'); await settle();
    expect(spoken.at(-1)?.text).toContain('What equation do you get after doing that to both sides?');
    expect(spoken.at(-1)?.text).not.toContain('Would you like a hint');
    await answer(utterance); await settle();
    if (destination === 'lesson') {
      expect(spoken.at(-1)?.text).toContain('could not identify an available lesson');
      expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
      await act(async () => root.unmount()); return;
    }
    expect(spoken.at(-1)?.text).toContain('unfinished');
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer(destination === 'home' ? 'yes' : 'Yes, switch lessons please'); await settle();
    if (destination === 'home') expect(document.querySelector('#home-heading')).not.toBeNull();
    else expect(document.querySelector('#lesson-heading')?.textContent).toBe('Parts of a Whole');
    const progress = JSON.parse(localStorage.getItem('tiesua-progress') || '{}');
    expect(progress.completed?.['equations-fraction']).not.toBeTruthy();
    await act(async () => root.unmount());
  });
  it.each(['What would happen if we went home?', 'What if I switched to fractions later?', 'Please do not take me home'])('keeps the verified equation when an incorrect departure proposal is declined: %s', async utterance => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle(); await answer('multiply by five'); await settle();
    await answer(utterance); await settle();
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    expect(spoken.at(-1)?.text).toMatch(/(?:stay here|remains unfinished)/);
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus three equals twenty'); await settle();
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    await act(async () => root.unmount());
  });
  it('retains the pending equation when a learner declines a proposed switch', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle(); await answer('multiply by five'); await settle();
    await answer('Take me back home please'); await settle();
    await answer('Actually I would rather stay'); await settle();
    expect(spoken.at(-1)?.text).toContain('stay with this question');
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus three equals twenty'); await settle();
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    await act(async () => root.unmount());
  });
  it('preserves the unfinished equation when switching lessons and returning', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle(); await answer('multiply by five'); await settle();
    await answer('Take me back home please'); await settle(); await answer('yes'); await settle();
    expect(document.querySelector('#home-heading')).not.toBeNull();
    await answer('open Solving Equations with a Fraction'); await settle();
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus three equals twenty'); await settle();
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    await act(async () => root.unmount());
  });
  it('does not execute an old activity choice after practice has begun', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('Let us practise together'); await settle();
    expect(document.body.textContent).toContain('x plus three, all over five, equals four');
    await answer('the second one'); await settle();
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    expect(document.body.textContent).toContain('x plus three, all over five, equals four');
    expect(document.body.textContent).toContain('together');
    await act(async () => root.unmount());
  });
  it.each(['open Parts of a Whole', 'open fractions-parts'])('rejects the retired lesson without starting teaching: %s', async request => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer(request); await settle();
    expect(document.querySelector('#lesson-heading')).toBeNull();
    expect(document.querySelector('#home-heading')).not.toBeNull();
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it.each([
    ['I want to study', 'lessons'], ['the first one', 'lessons'],
    ['How does TieSua work?', 'guide'], ['the second one', 'guide'],
  ])('offers the Home choice and executes "%s"', async (answerText, destination) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    expect(spoken.some(s => s.text.includes('Would you like to study, or first hear how this platform works?'))).toBe(true);
    await answer(answerText); await settle();
    if (destination === 'lessons') {
      expect(document.querySelector('#home-heading')).not.toBeNull();
      expect(document.querySelector('#lessons-heading')).toBeNull();
      expect(spoken.at(-1)?.text).toContain('solve equations with fractions');
      expect(spoken.at(-1)?.text).toContain('solve equations with fractions');
    }
    else expect(spoken.some(s => s.text.includes('Let us try this together'))).toBe(true);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('plays the Home guide and makes it available without starting the microphone', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    const guide = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('How TieSua works'))!;
    await act(async () => guide.click()); await settle();
    expect(spoken.some(s => s.text.includes('Let us try this together'))).toBe(true);
    expect(Recognition.active).toBeNull();
    await act(async () => root.unmount());
  });
  it('lists English voices and plays the selected voice on request', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const english = { name: 'English voice', lang: 'en-GB', voiceURI: 'english' };
    const french = { name: 'French voice', lang: 'fr-FR', voiceURI: 'french' };
    vi.spyOn(synth, 'getVoices').mockReturnValue([english, french] as never[]);
    const speakSpy = vi.spyOn(synth, 'speak');
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    const nav = [...document.querySelectorAll('.dock-btn')].find(b => b.textContent?.includes('Settings')) as HTMLButtonElement;
    await act(async () => nav.click());
    const select = document.querySelector<HTMLSelectElement>('#voice')!;
    expect(select.textContent).toContain('English voice');
    expect(select.textContent).not.toContain('French voice');
    await act(async () => { select.value = 'english'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click('[aria-label="Hear this voice"]'); await advance(500);
    expect(spoken.some(s => s.text.includes('Hello! Let us learn mathematics together.'))).toBe(true);
    expect(speakSpy.mock.calls.at(-1)?.[0].voice).toBe(english);
    await act(async () => root.unmount());
  });
  it('keeps the latest learner utterance and TieSua speech distinct across navigation', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('I want to study'); await settle();
    const panel = document.querySelector('.conversation-panel')!;
    expect(panel.textContent).toContain('Last heard:I want to study');
    expect(panel.textContent).toContain('Last said:');
    expect(panel.textContent).toContain('solve equations with fractions');
    const nav = [...document.querySelectorAll('.dock-btn')].find(b => b.textContent?.includes('Lessons')) as HTMLButtonElement;
    await act(async () => nav.click());
    expect(document.querySelector('.conversation-panel')?.textContent).toContain('Last heard:I want to study');
    await act(async () => root.unmount());
  });
  it('teaches repeat and thinking time interactively, answers a question, then offers spoken lessons', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2500);
    await answer('the second one'); await settle();
    expect(spoken.at(-1)?.text).toContain('ask me to say something again');
    await answer('Could you say that once more?'); await settle();
    expect(spoken.at(-1)?.text).toContain('Two over four means two of four equal parts');
    expect(spoken.at(-1)?.text).toContain('asking for more time');
    await answer('Please give me a little more time'); await settle();
    expect(spoken.at(-1)?.text).toContain('how you can ask for more time');
    await answer('Can I type instead?'); await settle();
    expect(spoken.at(-1)?.text).toContain('keyboard button opens');
    await answer('Yes, let us move on'); await settle();
    expect(spoken.at(-1)?.text).toContain('start studying');
    await answer('I would like to start studying'); await settle();
    expect(document.querySelector('#home-heading')).not.toBeNull();
    expect(spoken.at(-1)?.text).toContain('solve equations with fractions');
    expect(spoken.at(-1)?.text).toContain('solve equations with fractions');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('does not reopen the microphone while a selected lesson is preparing its introduction', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    calls.delayOpening = true; calls.openingResolve = null;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await advance(5000);
      expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
      expect(calls.openingResolve).not.toBeNull();
      expect(Recognition.active).toBeNull();
      expect(document.body.textContent).toContain('Thinking');
      await act(async () => calls.openingResolve!({ source: 'mock', actions: [], teachingMove: 'none', reply: 'Let us begin. Are you ready?', continuation: 'await-response' }));
      await settle();
      expect(spoken.some(s => s.text === LESSONS[0].intro.join(' '))).toBe(true);
      expect(Recognition.active).not.toBeNull();
    } finally { calls.delayOpening = false; calls.openingResolve = null; await act(async () => root.unmount()); }
  });
  it.each(['I need more time to think', 'hang on a minute', 'I need a bit more time'])('waits quietly for thinking time: %s', async (request) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    clearLifecycleEvents(); setLifecycleLogEnabled(true);
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await answer(request); await settle();
    expect(spoken.at(-1)?.text).toContain('Take your time');
    const visiblePrompt = document.querySelector('.mn-say')?.textContent;
    const count = getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length;
    await advance(70000);
    expect(getLifecycleEvents().filter(e => e.kind === 'silence.follow-up')).toHaveLength(count);
    expect(Recognition.active).not.toBeNull();
    await answer('continue'); await settle();
    await advance(46000); await settle();
    expect(getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length).toBeGreaterThan(count);
    await act(async () => root.unmount());
  });
  it('returns from a prerequisite only after the explanation and resumes the same pending equation', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle();
    await answer('multiply by five'); await settle();
    await answer('I need help with multiplication'); await settle();
    expect(spoken.at(-1)?.text).toContain('two times three');
    await answer('six'); await settle();
    const teaching = spoken.findIndex(s => s.text.includes('Two groups of three make six'));
    const returning = spoken.findIndex(s => s.text.includes('Our equation is still'));
    expect(teaching).toBeGreaterThanOrEqual(0); expect(returning).toBeGreaterThan(teaching);
    expect(spoken[returning].text).toContain('What equation do you get');
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await act(async () => root.unmount());
  });
  it('restores the verified pending operation after leaving and reopening a lesson', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle();
    await answer('multiply by five'); await settle();
    await answer('Where are we?'); await settle();
    expect(spoken.at(-1)?.text).toContain('current equation');
    expect(spoken.at(-1)?.text).toContain('chosen an operation');
    const lessons = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Lessons')!;
    await act(async () => lessons.click()); await settle();
    expect(document.querySelector('#lesson-heading')).not.toBeNull();
    expect(Recognition.active).not.toBeNull();
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus three equals twenty'); await settle();
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    await act(async () => root.unmount());
  });
  it('does not falsely say the session ended when the model omitted the stop action', async () => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('I am finished for today'); await settle();
    expect(spoken.at(-1)?.text).toContain('I have not stopped the conversation yet');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it.each(['home', 'lesson'])('turns the microphone off when the learner ends the conversation from %s', async (screen) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    if (screen === 'lesson') { await answer('open Solving Equations with a Fraction'); await settle(); }
    await answer('I want to stop for today'); await settle();
    expect(Recognition.active).toBeNull();
    expect(spoken.some(s => s.text.includes('microphone is off'))).toBe(true);
    await advance(12000); expect(Recognition.active).toBeNull();
    await act(async () => root.unmount());
  });
  it.each([
    ['the first one', 'together', 'x plus three, all over five, equals four'],
    ['the second one', 'your turn', 'x plus one, all over three, equals five'],
  ])('waits at the example choice and starts the selected path: %s', async (choice, label, equation) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    expect(document.body.textContent).toContain('your choice');
    expect(Recognition.active).not.toBeNull();
    await advance(5000);
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    await answer(choice); await settle();
    expect(document.body.textContent?.toLowerCase()).toContain(label);
    expect(document.body.textContent).toContain(equation);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it.each(LESSONS)('resumes the worked example at a single spoken step: $id', async (lesson) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    saveSnapshot({ lessonId: lesson.id, stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    await answer(`open ${lesson.title}`); await settle();
    expect(spoken.at(-1)?.text).toContain(lesson.example.steps![0].explanation);
    expect(document.body.textContent).toContain('worked example');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it.each(["let's pick up where we left off", 'Can we carry on from last time?', 'Back to my lesson please'])('resumes the offered saved lesson through speech: %s', async phrase => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    localStorage.setItem('tiesua-progress', JSON.stringify({ completed: {}, lastLessonId: 'equations-fraction' }));
    localStorage.setItem('tiesua-visited', '1');
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: 5, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    expect(spoken.some(s => s.text.includes('pick up where we left off'))).toBe(true);
    await settle(); await answer(phrase); await settle();
    expect(document.querySelector('#home-heading')).toBeNull();
    expect(spoken.at(-1)?.text).toContain(LESSONS[0].example.steps![5].explanation);
    expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(5);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('keeps questions open after verified independent lesson completion', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      await completeTeachingJourney();
      await answer('the second one'); await settle();
      const problem = PROBLEMS.find(p => p.id === LESSONS[0].independentProblemId)!;
      for (const step of problem.validPath) { await answer(step); await settle(); }
      expect(document.body.textContent).toContain('lesson complete');
      expect(spoken.at(-1)?.text).toContain('You can still ask me questions');
      const progress = localStorage.getItem('tiesua-progress');
      for (const question of ['Why did we multiply both sides?', 'I am still confused about the fraction']) {
        await answer(question); await settle();
        expect(document.body.textContent).toContain('lesson complete');
        expect(document.querySelector('.mn-say')?.textContent).toContain('keeps the two sides equal');
        expect(localStorage.getItem('tiesua-progress')).toBe(progress);
        expect(Recognition.active).not.toBeNull();
      }
    } finally { await act(async () => root.unmount()); }
  });
  it('repairs a statement-only response and teaches division as fraction notation in order', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: 4, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      await answer("yeah that's what I said"); await settle();
      expect(spoken.at(-1)?.text).toContain('Can you tell me what happened in your own words?');
      expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(4);
      expect(Recognition.active).not.toBeNull();
      await answer('twelve sweets shared among four friends with three each'); await settle();
      expect(spoken.at(-1)?.text).toContain('Sharing equally is called division');
      await answer('the number of friends'); await settle();
      expect(spoken.at(-1)?.text).toContain('left hand side');
      await answer('understood step 6'); await settle();
      const introduction = spoken.at(-1)!.text;
      expect(introduction).toContain('A fraction is another way to write division');
      expect(introduction).toContain('The line means divided by');
      expect(introduction).toContain('What does twelve over four mean?');
      expect(document.querySelector('.math-eq')?.textContent).toContain('3');
      expect(Recognition.active).not.toBeNull();
      await answer('Twelve divided by four.'); await settle();
      expect(calls.turns).toContain('Twelve divided by four.');
      expect(spoken.at(-1)?.text).toContain('numerator');
      const rememberedQuestion = document.querySelector('.mn-say')?.textContent;
      await click('[aria-label="Turn conversation off"]');
      const utterances = spoken.length;
      await advance(300_000);
      expect(spoken.length).toBe(utterances);
      expect(document.querySelector('.mn-say')?.textContent).toBe(rememberedQuestion);
    } finally { await act(async () => root.unmount()); }
  });
  it.each(["let's start all over", "let's tattoo all over"])('confirms restart and protects the opening after %s', async phrase => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: 7, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      await answer(phrase); await settle();
      expect(spoken.at(-1)?.text).toContain('start this lesson over');
      expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(7);
      await answer('no'); await settle();
      expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(7);
      await answer(phrase); await settle();
      await answer('yes'); await settle();
      expect(document.body.textContent).toContain('introduction');
      expect(spoken.at(-1)?.text).toBe(LESSONS[0].intro.join(' '));
      expect(spoken.at(-1)?.text).toContain('missing number');
      expect(spoken.at(-1)?.text).not.toContain('equations with sharing');
      expect(Recognition.active).not.toBeNull();
      await answer('continue'); await settle();
      expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[0].prompt);
    } finally { await act(async () => root.unmount()); }
  });
  it.each([
    ['four friends shared and each got three', '12'],
    ['three', '12', 'four friends'],
    ['12', 'four friends', 'three'],
  ])('combines answers within a teaching step instead of cycling: %j', async (...answers: string[]) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: 4, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      for (let i = 0; i < answers.length; i++) {
        const before = calls.turns.length;
        await answer(answers[i]); await settle();
        expect(calls.turns.length).toBe(before + 1);
        expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(i === answers.length - 1 ? 5 : 4);
        expect(Recognition.active).not.toBeNull();
      }
      expect(spoken.at(-1)?.text).toContain('Sharing equally is called division');
      await answer('the number of friends'); await settle();
      const latest = vi.mocked(api.orchestrate).mock.calls.at(-1)![1];
      expect((latest.step_conversation as any).recent_turns).toEqual([]);
    } finally { await act(async () => root.unmount()); }
  });
  it('changes approach after repeated incomplete assessments without granting success', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: 4, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      for (let i = 0; i < 3; i++) { await answer('loop answer'); await settle(); }
      expect(spoken.at(-1)?.text).toContain('I may be misunderstanding your answer');
      expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(4);
      expect(Recognition.active).not.toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
  it.each([
    [6, 'the right hand side but wait can you slow down just a bit'],
    [1, 'four sweets but can you slow down?'],
  ] as const)('acknowledges an answer and slower speech together at step %s', async (index, utterance) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: index, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      const previousRate = spoken.at(-1)!.rate;
      const before = calls.turns.length;
      await answer(utterance); await settle();
      expect(calls.turns.length).toBe(before + 1);
      expect(spoken.at(-1)?.text).toMatch(/^(?:That is right|Yes)/);
      expect(spoken.at(-1)?.text).toContain('I will speak more slowly');
      expect(spoken.at(-1)?.text).toContain(EQUATION_JOURNEY[index + 1].prompt);
      expect(spoken.at(-1)!.rate).toBeLessThan(previousRate);
      expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(index + 1);
      expect(Recognition.active).not.toBeNull();
      const mainText = document.querySelector('.mn-say')?.textContent;
      const mainMath = document.querySelector('.mn-math')?.textContent;
      for (const control of ['hang on I am coming', 'Please speak more slowly', 'oh this sweets before I Shelly']) {
        await answer(control); await settle();
        expect(document.querySelector('.mn-say')?.textContent).toBe(mainText);
        expect(document.querySelector('.mn-math')?.textContent).toBe(mainMath);
        expect(Recognition.active).not.toBeNull();
      }
      expect(document.querySelector('.conversation-panel')?.textContent).toContain("I didn't");
    } finally { await act(async () => root.unmount()); }
  });
  it.each(['throw', 'unavailable'])('pauses after a service failure, keeps the prompt and retries the saved answer once: %s', async mode => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    clearLifecycleEvents(); setLifecycleLogEnabled(true);
    const step = BOX_STORY_START;
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', itemSet: 'guided', itemIndex: 0, support: 'guided',
      problemId: null, exampleStep: step, exampleVersion: 4, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      const main = document.querySelector('.mn-say')?.textContent;
      const math = document.querySelector('.mn-math')?.textContent;
      calls.failService = 1; calls.serviceMode = mode;
      const before = calls.turns.length;
      await answer('two sweets were added'); await settle();
      expect(document.querySelector('.mn-say')?.textContent).toBe(main);
      expect(document.querySelector('.mn-math')?.textContent).toBe(math);
      expect(spoken.at(-1)?.text).toContain('Would you like me to try your last request again?');
      expect(Recognition.active).not.toBeNull();
      const reminderCount = getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length;
      const speechCount = spoken.length;
      await advance(180000); await settle();
      expect(spoken.length).toBe(speechCount);
      expect(calls.turns.length).toBe(before + 1);
      expect(getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length).toBe(reminderCount);
      if (mode === 'throw') { if (!Recognition.active) { await click('[aria-label="Talk to TieSua"]'); await advance(1000); } await answer('retry'); }
      else await click('[aria-label="Retry previous answer"]');
      await settle();
      expect(calls.turns.length).toBe(before + 2);
      expect(calls.turns.at(-1)).toBe('two sweets were added');
      expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[step + 1].prompt);
      expect(document.querySelector('[aria-label="Retry previous answer"]')).toBeNull();
      expect(Recognition.active).not.toBeNull();
    } finally { calls.failService = 0; await act(async () => root.unmount()); }
  });
  it('reports a recognition connection error accurately without losing the question or restarting capture', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    try {
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      await answer('continue'); await settle();
      const main = document.querySelector('.mn-say')?.textContent;
      const staleError = Recognition.active!.onerror!;
      await act(async () => staleError({ error: 'network' })); await settle();
      expect(document.querySelector('.mn-say')?.textContent).toBe(main);
      expect(spoken.at(-1)?.text).toContain('speech recognition connection failed');
      expect(Recognition.active).toBeNull();
      await advance(60000); await settle();
      expect(Recognition.active).toBeNull();
      await click('[aria-label="Turn conversation on"]'); await settle();
      const current = Recognition.active;
      expect(current).not.toBeNull();
      await act(async () => staleError({ error: 'network' }));
      expect(Recognition.active).toBe(current);
    } finally { await act(async () => root.unmount()); }
  });
  it('introduces sharing before notation and checks a spoken counting answer', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await answer('continue'); await settle();
    expect(spoken.at(-1)?.text).toContain('What do you think equally means?');
    expect(document.querySelector('.mn-math')).toBeNull();
    await answer('everyone gets the same number'); await settle();
    expect(spoken.at(-1)?.text).toContain('one sweet');
    await answer('I want to continue'); await settle();
    expect(spoken.at(-1)?.text).toContain('one sweet');
    expect(spoken.at(-1)?.text).not.toContain('Four sweets are gone');
    await answer('I am giving the sweets out'); await settle();
    expect(spoken.at(-1)?.text).toContain('You are sharing them out');
    expect(spoken.at(-1)?.text).not.toContain('Four sweets are gone');
    await answer('three'); await settle();
    expect(spoken.at(-1)?.text).toContain('one sweet');
    await answer('ate'); await settle();
    expect(spoken.at(-1)?.text).toContain('I understood 8');
    expect(document.querySelector('.mn-stage-line')?.textContent).toContain('One sweet for everyone');
    await answer('fore'); await settle();
    expect(spoken.at(-1)?.text).toContain('Four sweets are gone');
    expect(document.querySelector('.mn-math')).toBeNull();
    await act(async () => root.unmount());
  });
  it('starts hands-free listening when a learner clicks Continue from Home', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    localStorage.setItem('tiesua-progress', JSON.stringify({ completed: {}, lastLessonId: 'equations-fraction' }));
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', exampleStep: 0, exampleVersion: 4, itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    expect(Recognition.active).toBeNull();
    await click('.home-continue'); await settle();
    expect(spoken.at(-1)?.text).toContain('What do you think equally means?');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('reviews only visited steps and keeps hands-free conversation through backward and forward navigation', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    localStorage.setItem('tiesua-progress', JSON.stringify({ completed: {}, lastLessonId: 'equations-fraction' }));
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', exampleStep: 6, exampleVersion: 4, itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('.home-continue'); await settle();
    expect(document.querySelector('.mn-say')?.getAttribute('aria-live')).toBe('off');
    await answer('Can we go back to the previous part?'); await settle();
    expect(Recognition.active).not.toBeNull();
    expect(document.body.textContent).toContain('Reviewing an earlier step');
    expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[5].prompt);
    await answer('Could you explain more?'); await settle();
    expect(document.querySelector('.mn-say')?.textContent).toContain('break this idea');
    expect(document.querySelector('.mn-stage-line')?.textContent).toContain(EQUATION_JOURNEY[5].title);
    await answer('the number of friends'); await settle();
    expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[6].prompt);
    expect((document.querySelector('[aria-label="Next visited teaching step"]') as HTMLButtonElement).disabled).toBe(true);
    expect(Recognition.active).not.toBeNull();
    expect(document.body.textContent).not.toContain('Reviewing an earlier step');
    await click('[aria-label="Previous teaching step"]'); await settle();
    const returnButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Return to current step')!;
    await act(async () => returnButton.click()); await settle();
    expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[6].prompt);
    expect(JSON.parse(localStorage.getItem('tiesua-lesson-resume:equations-fraction')!).exampleStep).toBe(6);
    await click('[aria-label="Turn conversation off"]'); await settle();
    await click('[aria-label="Previous teaching step"]'); await settle();
    expect(Recognition.active).toBeNull();
    await act(async () => root.unmount());
  });
  it.each(EQUATION_JOURNEY.slice(0, TEACHING_STEP_COUNT).map((step, index) => ({ ...step, index })))('keeps explanation requests and misrouted checks on teaching step $index', async step => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    localStorage.setItem('tiesua-progress', JSON.stringify({ completed: {}, lastLessonId: 'equations-fraction' }));
    saveSnapshot({ lessonId: 'equations-fraction', stage: 'example', exampleStep: step.index, exampleVersion: 4, itemSet: 'guided', itemIndex: 0, support: 'guided', problemId: null, savedAt: new Date().toISOString() });
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('.home-continue'); await settle();
    const math = document.querySelector('.mn-math')?.textContent;
    await answer('Could you explain more?'); await settle();
    expect(spoken.at(-1)?.text).toContain('break this idea');
    expect(document.querySelector('.mn-math')?.textContent).toBe(math);
    const sentContext = vi.mocked(api.orchestrate).mock.calls.at(-1)![1];
    expect(sentContext.input_mode).toBe('speech');
    expect(sentContext.objective).toBe(step.guidance);
    const currentTeaching = sentContext.teaching_step as { scenario: string; guidance: string };
    expect(currentTeaching.guidance).toBe(step.guidance);
    expect(currentTeaching.scenario).toContain(step.index < BOX_STORY_START ? 'No sweets have been added' : 'add two');
    await answer('misrouted check'); await settle();
    expect(spoken.at(-1)?.text).toBe(step.prompt);
    expect(document.body.textContent).toContain('worked example');
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('moves through the complete teaching sequence before offering practice', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await answer('continue'); await settle();
    for (let i = 0; i < TEACHING_STEP_COUNT; i++) {
      const step = EQUATION_JOURNEY[i];
      expect(document.querySelector('.mn-say')?.textContent).toContain(step.prompt);
      expect(Boolean(document.querySelector('.mn-math')), step.title + ': ' + step.expression).toBe(Boolean(step.expression));
      await answer(step.numericAnswer === undefined ? `understood step ${i}` : String(step.numericAnswer));
      await settle();
    }
    expect(document.body.textContent).toContain('your choice');
    await answer('the first one'); await settle();
    expect(document.body.textContent).toContain('together');
    expect(document.body.textContent).toContain('x plus three');
    await act(async () => root.unmount());
  });
  it('retains the local page and controls in every bottom tab', async () => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    const dock = async (label: string) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.dock-btn')].find(b => b.textContent?.includes(label))!;
      await act(async () => button.click()); await settle();
    };
    const textButton = async (text: string) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!;
      expect(button).toBeTruthy(); await act(async () => button.click()); await settle();
    };
    try {
      await dock('Lessons'); await textButton('See upcoming lessons');
      const lessonsHeading = document.querySelector('#lessons-heading');
      expect(lessonsHeading?.textContent).toBe('Coming soon');
      await dock('Explore'); await textButton('Explore more expressions');
      await click('.expression-explore'); await settle();
      const expression = document.querySelector('.math-eq') ?? document.querySelector('.math-frac');
      await dock('Settings'); await textButton('Interaction settings');
      const pauseControl = document.querySelector<HTMLSelectElement>('#listening-quiet')!;
      expect(pauseControl).not.toBeNull();
      await act(async () => { pauseControl.value = '5'; pauseControl.dispatchEvent(new Event('change', { bubbles: true })); });
      const settingsHeading = document.querySelector('h2');
      await dock('Home');
      expect(document.querySelector('#home-heading')).not.toBeNull();
      await dock('Settings');
      expect(document.querySelector('h2')).toBe(settingsHeading);
      expect(document.querySelector('#listening-quiet')).toBe(pauseControl);
      expect(pauseControl.value).toBe('5');
      await dock('Explore');
      expect(document.querySelector('.math-eq') ?? document.querySelector('.math-frac')).toBe(expression);
      await dock('Lessons');
      expect(document.querySelector('#lessons-heading')).toBe(lessonsHeading);
      expect(Recognition.active).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
  it.each(LESSONS)('keeps the current example step through Settings and Home: $id', async (lesson) => {
    vi.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance; (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer(`open ${lesson.title}`); await settle();
    await answer('continue'); await settle();
    expect(spoken.at(-1)?.text).toContain(lesson.example.steps![0].explanation);
    await answer('everyone gets the same number'); await settle();
    expect(spoken.at(-1)?.text).toContain(lesson.example.steps![1].explanation);
    expect(document.body.textContent).toContain('worked example');
    const initializations = calls.turns.filter(t => t.startsWith('Begin this lesson')).length;
    const originalScreen = document.querySelector('.mn-say');
    const settings = [...document.querySelectorAll('.dock-btn')].find(b => b.textContent?.includes('Settings')) as HTMLButtonElement;
    await act(async () => settings.click());
    const reminderCount = getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length;
    await advance(60000); await settle();
    expect(getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length).toBe(reminderCount);
    const speed = document.querySelector<HTMLInputElement>('input[type="range"]');
    if (speed) await act(async () => { speed.value = '1'; speed.dispatchEvent(new Event('input', { bubbles: true })); });
    const home = [...document.querySelectorAll('.dock-btn')].find(b => b.textContent?.includes('Home')) as HTMLButtonElement;
    await act(async () => home.click());
    await settle();
    expect(document.querySelector('#home-heading')).toBeNull();
    expect(document.querySelector('#lesson-heading')).not.toBeNull();
    expect(calls.turns.filter(t => t.startsWith('Begin this lesson'))).toHaveLength(initializations);
    expect(document.querySelector('.mn-say')).toBe(originalScreen);
    expect(Recognition.active).not.toBeNull();
    expect(spoken.at(-1)?.text).toContain(lesson.example.steps![1].explanation);
    expect(spoken.at(-1)?.text).not.toContain('restart');
    await act(async () => root.unmount());
  });
  it.each(PROBLEMS)('runs every equation-bank path through mounted voice input: $id', async (problem) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const lesson = LESSONS.find(l => l.kind === 'equations')!;
    const original = lesson.guidedProblemId;
    lesson.guidedProblemId = problem.id;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
      await answer('open Solving Equations with a Fraction'); await settle();
      await completeTeachingJourney();
      await answer('the first one'); await settle();
      for (const step of problem.validPath) {
        await answer(step); await settle();
        const op = step.match(/^(multiply|divide|add|subtract)/)?.[1];
        if (op && op !== 'divide') {
          const symbol = ({ multiply: '×', add: '+', subtract: '−' } as Record<string, string>)[op];
          expect([...document.querySelectorAll('.math-eq .math-op')].filter(el => el.textContent === symbol).length).toBeGreaterThanOrEqual(2);
        }
        if (op === 'divide') expect(document.querySelectorAll('.math-eq .math-frac').length).toBeGreaterThanOrEqual(2);
      }
      expect(document.body.textContent).toContain('your choice');
      expect(document.body.textContent).toContain(problem.solution.replaceAll(' ', ''));
      expect(Recognition.active).not.toBeNull();
    } finally { await act(async () => root.unmount()); lesson.guidedProblemId = original; }
  });
  it.each([
    ['Solving Equations with a Fraction', "yeah I'm already"],

    ['Solving Equations with a Fraction', "yes I'm ready"],

  ])('does not skip the first example when a model proposes practice in %s (%s)', async (title, ready) => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer(`open ${title}`); await settle();
    await answer(ready); await settle();
    expect(document.querySelector('.mn-say')?.textContent).toContain(EQUATION_JOURNEY[0].prompt);
    expect(document.querySelector('.mn-math')).toBeNull();
    expect(spoken.some(s => s.text.includes('We have finished this example'))).toBe(false);
    await act(async () => root.unmount());
  });
  it.each(['Solving Equations with a Fraction'])('continues naturally and hears the learner in %s', async (title) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); calls.turns.length = 0; calls.trace.length = 0; spoken.length = 0; Recognition.active = null; generation++;
    clearLifecycleEvents(); setLifecycleLogEnabled(true);
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer(`open ${title}`);
    expect(calls.turns.filter(t => t === `open ${title}`)).toHaveLength(1); await settle();
    expect(document.querySelector('#lesson-heading')?.textContent).toBe(title);
    expect(Recognition.active).not.toBeNull();
    await answer('continue'); await settle();
    expect(document.querySelector('.mn-math')).toBeNull();
    for (let i = 0; i < TEACHING_STEP_COUNT; i++) {
      const step = EQUATION_JOURNEY[i];
      await answer(i === TEACHING_STEP_COUNT - 1 ? 'We undid the division' : step.numericAnswer === undefined ? `understood step ${i}` : String(step.numericAnswer));
      await settle();
    }
    expect(spoken.some(s => s.text.includes('We have finished this example'))).toBe(true);
    const transition = spoken.at(-1)!.text;
    expect(transition).toMatch(/^Yes\. We undid division by four first by multiplying both sides by four\./);
    expect(transition).toContain('You can ask me any questions');
    for (const question of ['Why did we multiply both sides?', 'I am still confused about the fraction']) {
      const before = calls.turns.length;
      await answer(question); await settle();
      expect(calls.turns.length).toBe(before + 1);
      expect(document.body.textContent).toContain('your choice');
      expect(document.querySelector('.mn-say')?.textContent).toContain('keeps the two sides equal');
      expect(Recognition.active).not.toBeNull();
    }

    expect(document.querySelector('#lesson-heading')).not.toBeNull();

    expect(Recognition.active).not.toBeNull();
    const visiblePrompt = document.querySelector('.mn-say')?.textContent;
    const count = getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length;
    for (const seconds of [45, 30, 45, 60, 90]) { await advance(seconds * 1000 + 1500); await settle(); }
    const reminders = getLifecycleEvents().filter(e => e.kind === 'silence.follow-up');
    expect(reminders.length - count).toBe(5);
    expect(document.querySelector('.mn-say')?.textContent).toBe(visiblePrompt);
    expect(document.querySelector('.conversation-panel')?.textContent).toContain('Last said:');
    const lifecycle = getLifecycleEvents();
    for (const [i, reminder] of reminders.entries()) {
      const priorListen = lifecycle.filter(e => e.kind === 'session.listen-start' && e.at < reminder.at).at(-1)!;
      const armed = lifecycle.filter(e => e.kind === 'silence.armed' && e.at <= reminder.at).at(-1)!;
      expect(new Date(reminder.at).getTime() - new Date(armed.at).getTime()).toBe([45, 30, 45, 60, 90][i] * 1000);
      // React renders the listening snapshot on the next harness tick (50ms).
      expect(new Date(armed.at).getTime() - new Date(priorListen.at).getTime()).toBeLessThanOrEqual(50);
    }
    await advance(70000); expect(getLifecycleEvents().filter(e => e.kind === 'silence.follow-up').length).toBe(reminders.length);
    const selected = Recognition.active!;
    await answer('the first one'); await settle();
    await act(async () => selected.final('the first one'));
    expect(document.body.textContent).toContain('together');
    expect(Recognition.active).not.toBeNull();
    expect(document.body.textContent).toContain('together');
    if (title.startsWith('Solving')) {
      vi.mocked(api.submitStep).mockClear();
      await answer('multiply by five'); await settle();
      expect(api.submitStep).toHaveBeenCalledTimes(1);
      expect(api.submitStep).toHaveBeenCalledWith(expect.any(String), 'multiply by five');
      expect(spoken.some(s => s.text.includes('valid operation'))).toBe(true);
      expect(spoken.some(s => s.text.includes('What equation do you get after doing that to both sides?'))).toBe(true);
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    } else {
      await answer('three'); await settle();
      expect(document.body.textContent).toContain('Correct');
    }
    expect(Recognition.active).not.toBeNull();
    console.log(JSON.stringify({ lesson: title, events: [...getLifecycleEvents().filter(e => ['speech.start','speech.done','session.listen-start','session.dispatch','silence.armed','silence.follow-up'].includes(e.kind)).map(e => ({ at: e.at, kind: e.kind, detail: e.detail })), ...calls.trace].sort((a, b) => a.at.localeCompare(b.at)) }));
    await act(async () => root.unmount());
  });
  it('does not speak a stale reply after navigation, and reports failed recognition without a restart loop', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; calls.resolve = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('delayed response');
    expect(calls.resolve).not.toBeNull();
    const lessons = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Lessons')!;
    await act(async () => lessons.click());
    await act(async () => calls.resolve!({ source: 'mock', actions: [], reply: 'OBSOLETE REPLY', teachingMove: 'none' }));
    await settle();
    expect(spoken.some(s => s.text.includes('OBSOLETE REPLY'))).toBe(false);
    await act(async () => root.unmount());
    Recognition.active = null; Recognition.failNext = true;
    const root2 = createRoot(container); await act(async () => root2.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(450);
    expect(Recognition.active).toBeNull();
    expect(document.body.textContent).toContain('Listening paused');
    await advance(3000); expect(Recognition.active).not.toBeNull();
    await act(async () => root2.unmount());
  });

  it('explicit Stop cancels the example and a stale synthesis end cannot launch the next choice', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    holdExample = true; held = null;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await answer('continue'); await advance(250);
    expect(held).not.toBeNull();
    const stop = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Stop')!;
    await act(async () => stop.click());
    await act(async () => held!.onend?.());
    await advance(3000);
    expect(spoken.some(s => s.text.includes('We have finished this example'))).toBe(false);
    expect(Recognition.active).not.toBeNull();
    holdExample = false; held = null;
    await act(async () => root.unmount());
  });

  it('suppresses a delayed response when a newer learner turn chooses a lesson', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; calls.resolve = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('delayed response');
    await click('[aria-label="Type instead"]');
    const input = document.querySelector<HTMLInputElement>('#home-input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'open Solving Equations with a Fraction');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    await act(async () => calls.resolve!({ source: 'mock', actions: [], reply: 'OLD TURN REPLY', teachingMove: 'none' }));
    await settle();
    expect(spoken.some(s => s.text.includes('OLD TURN REPLY'))).toBe(false);
    await act(async () => root.unmount());
  });

  it('completes the equation lesson through verified guided and independent work', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle();
    await answer('I am lost'); await settle();
    expect(spoken.at(-1)?.text).toContain('What operation undoes dividing by three');
    expect(document.querySelector('#lesson-heading')?.textContent).toBe('Solving Equations with a Fraction');
    await answer('multiply by five'); await settle();
    await answer('continue'); await settle();
    expect(spoken.some(s => s.text.includes('This question is still unfinished'))).toBe(true);
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus six equals seven'); await settle();
    expect(document.querySelector('.math-eq')?.textContent).toContain('\u00d7(5)=(4)\u00d7(5)');
    await answer('x plus three equals twenty'); await settle();
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    await answer('take away three from both sides'); await settle();
    await answer('x equals seventeen'); await settle();
    expect(document.body.textContent).toContain('x=17');
    await answer('the second one'); await settle();
    await answer('x equals fourteen'); await settle();
    expect(document.body.textContent).toContain('lesson complete');
    expect(spoken.some(s => s.text.includes('learn something else'))).toBe(true);
    expect(Recognition.active).not.toBeNull();
    await answer('the second one'); await settle();
    expect(document.querySelector('#lessons-heading')).not.toBeNull();
    await act(async () => root.unmount());
  }, 15000);

  it('opens a lesson exactly once under the actual StrictMode app wrapper', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; calls.turns.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    expect(spoken.some(s => s.text === LESSONS[0].intro.join(' '))).toBe(true);
    expect(calls.turns.filter(t => t.startsWith('Begin this lesson'))).toHaveLength(1);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('resynchronizes the verified equation after a lost step response', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as any).SpeechSynthesisUtterance = Utterance;
    (window as any).SpeechRecognition = Recognition;
    localStorage.clear(); sessionStorage.clear(); spoken.length = 0; Recognition.active = null; generation++;
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); await act(async () => root.render(<App />));
    await click('[aria-label="Start hands-free conversation"]'); await advance(2000);
    await answer('open Solving Equations with a Fraction'); await settle();
    await completeTeachingJourney();
    await answer('the first one'); await settle();
    vi.mocked(api.submitStep).mockClear();
    calls.dropNext = true;
    await answer('x plus three equals twenty'); await settle();
    expect(spoken.some(s => s.text.includes('Would you like me to try your last request again?'))).toBe(true);
    expect(Recognition.active).not.toBeNull();
    await click('[aria-label="Retry previous answer"]'); await settle();
    expect(api.submitStep).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('x plus three, equals twenty');
    expect(spoken.some(s => s.text.includes('found your current equation'))).toBe(true);
    expect(Recognition.active).not.toBeNull();
    await act(async () => root.unmount());
  });

});

