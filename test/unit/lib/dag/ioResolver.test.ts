import { describe, expect, it, vi } from 'vitest';
import { parseHttpCallOutputs, parseNodeOutputs, resolveInputs } from '@/lib/dag/ioResolver';

describe('ioResolver', () => {
  it('happy path: resolves env inputs and parses declared output keys', () => {
    const env = resolveInputs(
      {
        USER_ID: 'fetch.body',
      },
      {
        fetch: { body: '42', ignored: true },
      }
    );
    expect(env).toEqual(['USER_ID=42']);

    const parsed = parseNodeOutputs('line1\n{"result":"ok","extra":"x"}', ['result']);
    expect(parsed).toEqual({ result: 'ok' });
  });

  it('malformed input: ignores invalid source paths and missing fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = resolveInputs(
      {
        BAD: 'noDotPath',
        MISSING: 'node.missing',
      },
      { node: { ok: true } }
    );
    expect(env).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('chaotic path: handles malformed logs without throwing', () => {
    expect(parseNodeOutputs('not-json', ['a'])).toEqual({});

    const httpParsed = parseHttpCallOutputs('{"status":"up"}\n{"__statusCode__": 200}', [
      'statusCode',
      'body',
    ]);
    expect(httpParsed).toEqual({
      statusCode: 200,
      body: { status: 'up' },
    });

    const bodyOnly = parseHttpCallOutputs('ok\n{"__statusCode__": 201}', ['body']);
    expect(bodyOnly).toEqual({
      body: 'ok',
      statusCode: 201,
    });
  });
});
