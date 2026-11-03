import { logLifecycle } from '../speech/lifecycleLog';
import { isLearnerQuestion } from '../lessons/checker';

/** Client for the TieSua verification API. The backend is the only
 * authority on correctness; this module never marks steps itself. */

const API_BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? 'http://127.0.0.1:8000';

export interface VerifiedState {
  equation_text: string;
  problem_text: string;
  solved: boolean;
  step_index: number;
  pending_operation: string | null;
  restrictions?: string[];
  extraneous_check_required?: boolean;
  solutions_found?: string[];
}

export interface StepResult {
  session_id: string;
  action_type: 'operation' | 'resulting_equation' | 'final_answer' | 'question' | 'navigation' | 'incomplete_input';
  verdict: 'valid' | 'invalid' | 'incomplete' | 'unsupported' | 'clarification_needed';
  error_category: string | null;
  message: string;
  verified_facts: Record<string, unknown>;
  state: VerifiedState;
}

export interface TutorResult {
  source: 'live-meta' | 'fallback-scripted' | 'mock';
  model: string | null;
  text: string;
  /** Backend note (e.g. 'meta budget exhausted') — used only by the
   * dev decision trace to tell "Meta was called" apart from
   * "no live call was made". Never shown to learners. */
  diagnostics?: { note?: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const started = Date.now();
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-TieSua-Request-ID': crypto.randomUUID() },
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000),
  });
  } catch (error) {
    logLifecycle('api.failure', (error instanceof Error ? error.name : 'NetworkError') + '; elapsed=' + (Date.now() - started));
    throw error;
  }
  if (!response.ok) {
    logLifecycle('api.failure', 'HTTP ' + response.status + '; elapsed=' + (Date.now() - started));
    throw new Error('Service request failed (' + response.status + ')');
  }
  return (await response.json()) as T;
}

export const api = {
  createSession: (problem: string) =>
    request<{ session_id: string; state: VerifiedState }>('/v1/sessions', { method: 'POST', body: JSON.stringify({ problem }) }),
  getSession: (sessionId: string) =>
    request<{ session_id: string; state: VerifiedState }>(`/v1/sessions/${sessionId}`),
  submitStep: (sessionId: string, input: string) =>
    request<StepResult>(`/v1/sessions/${sessionId}/step`, { method: 'POST', body: JSON.stringify({ input }) }),
  tutor: (sessionId: string, question?: string) =>
    request<TutorResult>(`/v1/sessions/${sessionId}/tutor`, { method: 'POST', body: JSON.stringify({ question: question ?? null }) }),
  undo: (sessionId: string) =>
    request<StepResult>(`/v1/sessions/${sessionId}/undo`, { method: 'POST' }),
  interpret: (text: string, context: Record<string, unknown>) =>
    request<{ source: string; actions: { name: string; args?: Record<string, unknown>; scope?: string }[]; clarification?: string | null }>(
      '/v1/interpret', { method: 'POST', body: JSON.stringify({ text, context: { ...context, learner_purpose: isLearnerQuestion(text) ? "question-or-help" : "statement-or-request" } }) }),
  /** Central orchestrator: ONE decision per meaningful turn —
   * validated registry actions + a teaching move + a short reply. */
  orchestrate: (text: string, context: Record<string, unknown>) =>
    request<{ diagnostics?: { note?: string }; stepAssessment?: 'correct' | 'incorrect' | 'partial' | 'unanswered' | null; interpretedAnswer?: { value: number; confidence: number; purpose: 'answer' } | null; source: string; model?: string | null; actions: { name: string; args?: Record<string, unknown>; scope?: string }[]; teachingMove?: string; reply?: string; continuation?: 'await-response' | 'teach-next' | 'close'; clarification?: string | null }>(
      '/v1/orchestrate', { method: 'POST', body: JSON.stringify({ text, context: { ...context, learner_purpose: isLearnerQuestion(text) ? "question-or-help" : "statement-or-request" } }) }),
  /** Conceptual questions for lessons without an equation session,
   * answered by Meta strictly from the lesson's checked explanation. */
  tutorLesson: (lessonTitle: string, example: string, explanation: string, question: string) =>
    request<TutorResult>('/v1/tutor/lesson', {
      method: 'POST',
      body: JSON.stringify({ lesson_title: lessonTitle, example, explanation, question }),
    }),
};

export function tutorSourceLabel(result: TutorResult): string {
  if (result.source === 'live-meta') return `Live AI tutor · Meta ${result.model ?? ''}`.trim();
  if (result.source === 'mock') return 'Mock tutor · test only, not live AI';
  return 'Scripted guidance · live AI not connected';
}
