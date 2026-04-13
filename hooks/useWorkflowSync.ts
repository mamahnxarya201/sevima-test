import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { nodesAtom, edgesAtom, workflowTitleAtom } from '../store/workflowStore';
import { exportCanvasToDag } from '../lib/canvas/dagExporter';
import { authClient } from '@/lib/auth/auth-client';

function hashString(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

export function useWorkflowSync(workflowId: string | null) {
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);
  const title = useAtomValue(workflowTitleAtom);
  
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const wsRef = useRef<WebSocket | null>(null);
  const lastAckHashRef = useRef<string | null>(null);
  const currentHashRef = useRef<string | null>(null);

  // Reconnect logic
  useEffect(() => {
    if (!workflowId) return;

    let isMounted = true;
    let ws: WebSocket | null = null;

    const connect = async () => {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        
        if (!isMounted) return;

        const wsUrl = `${window.location.origin.replace('http', 'ws')}/api/ws/workflows/${workflowId}?token=${token}`;
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          if (isMounted) setSyncStatus('synced');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'sync_ack') {
              lastAckHashRef.current = msg.hash;
              if (isMounted) setSyncStatus('synced');
            } else if (msg.type === 'error') {
              console.error('Sync error:', msg.error, msg.details);
              if (isMounted) setSyncStatus('error');
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          if (isMounted) {
            setSyncStatus('error');
            setTimeout(connect, 5000); // Reconnect after 5s
          }
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('Failed to connect WS:', err);
        if (isMounted) {
          setSyncStatus('error');
          setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [workflowId]);

  // Debouncer 1: Fast Sync (2 seconds)
  useEffect(() => {
    if (!workflowId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const dag = exportCanvasToDag(title, nodes, edges);
    const jsonString = JSON.stringify(dag);
    const hash = hashString(jsonString);
    
    currentHashRef.current = hash;

    if (hash === lastAckHashRef.current) {
      return; // No changes
    }

    setSyncStatus('syncing');

    const timeoutId = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'sync',
          hash,
          payload: {
            name: title,
            definition: dag,
          }
        }));
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, title, workflowId]);

  // Debouncer 2: Discrepancy Check (30 seconds)
  useEffect(() => {
    if (!workflowId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const intervalId = setInterval(() => {
      if (currentHashRef.current !== lastAckHashRef.current) {
        // Force sync
        const dag = exportCanvasToDag(title, nodes, edges);
        const hash = hashString(JSON.stringify(dag));
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          setSyncStatus('syncing');
          wsRef.current.send(JSON.stringify({
            type: 'sync',
            hash,
            payload: {
              name: title,
              definition: dag,
            }
          }));
        }
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [nodes, edges, title, workflowId]);

  return syncStatus;
}
