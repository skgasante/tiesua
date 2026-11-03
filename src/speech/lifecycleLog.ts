/** Development-only, timestamped conversation lifecycle log.
 *
 * Records the exact sequence: AI response -> teaching action ->
 * speech queued/started/ended -> continuation -> listening ->
 * silence -> learner answer -> next move. Bounded local diagnostic
 * history survives reloads for 24 hours. No audio or network transmission.
 * Inspect with `window.__tiesuaLifecycle?.()` or export JSON with
 * `window.__tiesuaExportDiagnostics?.()`.
 * Enabled in dev builds or with localStorage 'tiesua-dev-trace'. */

export interface LifecycleEvent {
  at: string;
  elapsedMs: number;
  kind: string;
  detail: string;
}

const MAX_EVENTS = 1000;
const KEY = 'tiesua-diagnostics';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const events: LifecycleEvent[] = [];
try {
  const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
  if (Array.isArray(saved)) events.push(...saved.filter(e => e && typeof e.kind === 'string' && typeof e.detail === 'string' && Date.parse(e.at) > Date.now() - RETENTION_MS).slice(-MAX_EVENTS));
} catch { /* storage is optional */ }
const startedAt = Date.now();
let forced: boolean | null = null;

export function setLifecycleLogEnabled(v: boolean | null): void { forced = v; }

export function lifecycleLogEnabled(): boolean {
  if (forced !== null) return forced;
  try { if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) return true; } catch { /* ignore */ }
  try { return globalThis.localStorage?.getItem('tiesua-dev-trace') === '1'; } catch { return false; }
}

export function logLifecycle(kind: string, detail = ''): void {
  if (!lifecycleLogEnabled()) return;
  events.push({ at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, kind, detail: detail.slice(0, 120) });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  try {
    while (events.length && Date.parse(events[0].at) < Date.now() - RETENTION_MS) events.shift();
    globalThis.localStorage?.setItem(KEY, JSON.stringify(events));
    const w = globalThis as unknown as { __tiesuaLifecycle?: () => LifecycleEvent[]; __tiesuaExportDiagnostics?: () => string };
    w.__tiesuaLifecycle = () => events.map((e) => ({ ...e }));
    w.__tiesuaExportDiagnostics = () => JSON.stringify({ exportedAt: new Date().toISOString(), events: getLifecycleEvents() }, null, 2);
  } catch { /* no window */ }
}

export function getLifecycleEvents(): LifecycleEvent[] {
  return events.map((e) => ({ ...e }));
}

export function clearLifecycleEvents(): void {
  events.length = 0;
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* optional storage */ }
}
