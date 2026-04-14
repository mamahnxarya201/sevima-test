import { describe, expect, it } from 'vitest';
import { runWebSocketUrl, waitForWebSocketOpen } from '@/lib/socket/runWebSocketUrl';

function makeFakeWs(initialState = 0) {
  const listeners = new Map<string, Array<() => void>>();
  return {
    readyState: initialState,
    closeCalled: false,
    addEventListener(event: string, handler: () => void) {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    },
    emit(event: string) {
      for (const fn of listeners.get(event) ?? []) fn();
    },
    close() {
      this.closeCalled = true;
    },
  };
}

describe('runWebSocketUrl', () => {
  it('happy path: builds ws URL from browser origin', () => {
    const url = runWebSocketUrl('run-1', 'abc 123');
    expect(url).toContain('/api/ws/runs/run-1?token=');
    expect(url.startsWith('ws://') || url.startsWith('wss://')).toBe(true);
  });

  it('malformed input: still URL-encodes odd token values', () => {
    const url = runWebSocketUrl('run-2', '%%% ?token=');
    expect(url).toContain(encodeURIComponent('%%% ?token='));
  });

  it('chaotic path: waitForWebSocketOpen rejects on error events', async () => {
    const ws = makeFakeWs();
    const promise = waitForWebSocketOpen(ws as never, 50);
    ws.emit('error');
    await expect(promise).rejects.toThrow('WebSocket connection failed');
  });
});
