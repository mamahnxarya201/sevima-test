'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { nodesAtom } from '@/store/workflowStore';
import type { HttpConfig } from '@/lib/dag/types';
import { MaterialIcon } from '../ui/MaterialIcon';

type HeaderRow = { id: string; key: string; value: string };

function headersToRows(headers?: Record<string, string>): HeaderRow[] {
  const e = Object.entries(headers ?? {});
  if (e.length === 0) return [{ id: 'h0', key: '', value: '' }];
  return e.map(([key, value], i) => ({ id: `h${i}`, key, value }));
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> | undefined {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) o[k] = r.value;
  }
  return Object.keys(o).length ? o : undefined;
}

export const HttpNodeForm = ({ nodeId }: { nodeId: string }) => {
  const [nodes, setNodes] = useAtom(nodesAtom);

  const patchData = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
        )
      );
    },
    [nodeId, setNodes]
  );

  const http = useMemo(() => {
    const n = nodes.find((x) => x.id === nodeId);
    return ((n?.data as Record<string, unknown>)?.http ?? {}) as Partial<HttpConfig>;
  }, [nodes, nodeId]);

  const method = http.method ?? 'GET';
  const url = http.url ?? '';
  const body =
    typeof http.body === 'string'
      ? http.body
      : http.body != null
        ? JSON.stringify(http.body, null, 2)
        : '';

  const [headerRows, setHeaderRowsState] = useState<HeaderRow[]>(() => headersToRows(http.headers));

  useEffect(() => {
    setHeaderRowsState(headersToRows(http.headers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const updateHttp = useCallback(
    (next: Partial<HttpConfig>) => {
      patchData({ http: { ...http, ...next } });
    },
    [http, patchData]
  );

  const updateHeadersInNode = useCallback(
    (rows: HeaderRow[]) => {
      const headers = rowsToHeaders(rows);
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const data = { ...(n.data as Record<string, unknown>) };
          const httpPrev = { ...(data.http as Record<string, unknown>) };
          if (headers === undefined) {
            delete httpPrev.headers;
          } else {
            httpPrev.headers = headers;
          }
          data.http = httpPrev;
          return { ...n, data };
        })
      );
    },
    [nodeId, setNodes]
  );

  const addHeader = () => {
    const newRows = [...headerRows, { id: `h${Date.now()}`, key: '', value: '' }];
    setHeaderRowsState(newRows);
    updateHeadersInNode(newRows);
  };

  const removeHeader = (id: string) => {
    const newRows = headerRows.filter((h) => h.id !== id);
    setHeaderRowsState(newRows);
    updateHeadersInNode(newRows);
  };

  const updateHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    const newRows = headerRows.map((h) => (h.id === id ? { ...h, [field]: newValue } : h));
    setHeaderRowsState(newRows);
    updateHeadersInNode(newRows);
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-[11px] leading-relaxed text-[#2f342e]/75">
        Use upstream data in URL, headers, or body:{' '}
        <code className="rounded bg-[#edefe8] px-1 font-mono text-[10px] text-[#3a6095]">input.statusCode</code>,{' '}
        <code className="rounded bg-[#edefe8] px-1 font-mono text-[10px] text-[#3a6095]">input.body</code>, etc. Values
        merge from all nodes connected into this one.
      </p>
      <div className="flex w-full flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Method & URL</span>
        <div className="flex w-full gap-2">
          <div className="relative shrink-0">
            <select
              value={method}
              onChange={(e) => updateHttp({ method: e.target.value as HttpConfig['method'] })}
              className="w-24 cursor-pointer appearance-none rounded-xl border-none bg-[#f3f4ee] py-3 pl-4 pr-8 text-[13px] font-bold text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
            <MaterialIcon
              icon="expand_more"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-[#2f342e]"
            />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => updateHttp({ url: e.target.value })}
            placeholder="https://api.example.com/data"
            className="min-w-0 flex-1 rounded-xl border-none bg-[#f3f4ee] px-4 py-3 text-[13px] text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
          />
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Headers</span>
        <div className="flex w-full flex-col gap-2 rounded-[1.25rem] bg-[#f3f4ee] p-3">
          {headerRows.map((header) => (
            <div key={header.id} className="flex w-full items-center gap-2">
              <input
                type="text"
                placeholder="Key"
                value={header.key}
                onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                className="min-w-0 flex-1 rounded-xl border-none bg-white px-3 py-2.5 text-[13px] text-[#2f342e] shadow-sm outline-none focus:ring-2 focus:ring-[#3a6095]"
              />
              <input
                type="text"
                placeholder="Value"
                value={header.value}
                onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                className="min-w-0 flex-1 rounded-xl border-none bg-white px-3 py-2.5 text-[13px] text-[#2f342e] shadow-sm outline-none focus:ring-2 focus:ring-[#3a6095]"
              />
              <button
                type="button"
                onClick={() => removeHeader(header.id)}
                className="flex h-full w-8 shrink-0 items-center justify-center rounded-lg py-2 text-[#a83836] transition-colors hover:bg-[#fa746f]/20"
                title="Remove Header"
              >
                <MaterialIcon icon="close" className="text-[18px]" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addHeader}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-[13px] font-bold text-[#3a6095] transition-colors hover:bg-[#e0e4dc]"
          >
            <MaterialIcon icon="add" className="text-[18px]" /> Add Header
          </button>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Body (JSON)</span>
        <textarea
          value={body}
          onChange={(e) => {
            const t = e.target.value.trim();
            updateHttp({ body: t === '' ? undefined : t });
          }}
          placeholder="{}"
          className="h-32 w-full resize-none rounded-[1.25rem] border-none bg-[#f3f4ee] p-4 font-mono text-[13px] text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
        />
      </div>
    </div>
  );
};
