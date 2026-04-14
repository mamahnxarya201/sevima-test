/**
 * Browser WebSocket URL for `/api/ws/runs/:runId` (token query; no Bearer on WS handshake).
 */
export function runWebSocketUrl(runId: string, token: string): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/runs/${runId}?token=${encodeURIComponent(token)}`;
}

export function executionLogsWebSocketUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/execution-logs?token=${encodeURIComponent(token)}`;
}

export function waitForWebSocketOpen(ws: WebSocket, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      cleanup();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error('WebSocket connection timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(t);
    };

    ws.addEventListener(
      'open',
      () => {
        cleanup();
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('WebSocket connection failed'));
      },
      { once: true }
    );
  });
}
