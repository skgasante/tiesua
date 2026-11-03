import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('ends a hung verification request after the bounded timeout', async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
  })));
  const outcome = api.createSession('(x+2)/4=3').then(() => 'resolved', () => 'aborted');
  await vi.advanceTimersByTimeAsync(34999);
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await outcome).toBe('aborted');
});
