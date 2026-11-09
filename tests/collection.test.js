import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import {
  validateTarget, validateHeaders, validateCollection,
  readBody, executeCase, runCollection,
} from '../src/collection.js';

const collection = cases => ({ name: 'Local health checks', cases });
const one = (overrides = {}) => ({ id: 'health', url: 'http://127.0.0.1:1234/health', ...overrides });
const fakeResponse = (status = 200, body = '{"ok":true}', headers = {}) =>
  new Response(body, { status, headers });

test('validates HTTP targets and rejects credentials and fragments', () => {
  assert.equal(validateTarget('https://example.org/path'), 'https://example.org/path');
  for (const url of ['file:///tmp/test', 'ftp://example.org', 'http://u:p@host/',
    'https://example.org/#token']) {
    assert.throws(() => validateTarget(url), TypeError);
  }
  assert.throws(() => validateTarget('invalid'), TypeError);
  assert.throws(() => validateTarget('https://example.org/' + 'x'.repeat(2100)), RangeError);
});

test('accepts safe request headers and rejects restricted ones', () => {
  assert.deepEqual(validateHeaders({ Accept: 'application/json', 'X-Test': '1' }), {
    accept: 'application/json', 'x-test': '1',
  });
  for (const headers of [
    { Host: 'evil.example' }, { 'Content-Length': '10' },
    { 'bad name': 'x' }, { 'X-Test': 'a\nb' }, { 'X-Test': 'a\rb' },
    { 'X-Test': 'a\0b' }, { 'X-Test': 123 }, { 'X-Test': 'x'.repeat(4097) },
  ]) {
    assert.throws(() => validateHeaders(headers), TypeError);
  }
  assert.throws(() => validateHeaders([]), TypeError);
  assert.throws(() => validateHeaders(Object.fromEntries(
    Array.from({ length: 21 }, (_, i) => ['X-' + i, 'v']))), RangeError);
});

test('normalizes defaults and per-case overrides without mutating input', () => {
  const input = {
    name: 'A',
    defaults: { method: 'HEAD', timeoutMs: 300, expectedStatus: 204, retries: 1,
      headers: { Accept: 'text/plain' } },
    cases: [one({ method: 'GET', expectedStatus: 200, headers: { 'X-Id': '1' } })],
  };
  const snapshot = JSON.stringify(input);
  const result = validateCollection(input);
  assert.equal(result.cases[0].method, 'GET');
  assert.equal(result.cases[0].timeoutMs, 300);
  assert.equal(result.cases[0].expectedStatus, 200);
  assert.equal(result.cases[0].retries, 1);
  assert.deepEqual(result.cases[0].headers, { accept: 'text/plain', 'x-id': '1' });
  assert.equal(JSON.stringify(input), snapshot);
});

test('provides bounded defaults for cases without optional fields', () => {
  const item = validateCollection(collection([one()])).cases[0];
  assert.equal(item.method, 'GET');
  assert.equal(item.timeoutMs, 5000);
  assert.equal(item.expectedStatus, 200);
  assert.equal(item.retries, 0);
  assert.equal(item.retryDelayMs, 0);
  assert.deepEqual(item.assertions, []);
});

test('case headers replace defaults regardless of capitalization on the wire', async () => {
  const input = {
    name: 'Header overrides',
    defaults: { headers: { Authorization: 'Bearer default', Accept: 'text/plain' } },
    cases: [one({ headers: { authorization: 'Bearer case', ACCEPT: 'application/json' } })],
  };
  const snapshot = JSON.stringify(input);
  const result = await runCollection(input, {
    fetchImpl: async (_url, options) => {
      const headers = new Headers(options.headers);
      assert.equal(headers.get('authorization'), 'Bearer case');
      assert.equal(headers.get('accept'), 'application/json');
      return fakeResponse();
    },
  });
  assert.equal(result.success, true);
  assert.equal(JSON.stringify(input), snapshot);
});

test('rejects ambiguous duplicate header names in one settings object', () => {
  assert.throws(() => validateHeaders({ Accept: 'a', accept: 'b' }), /Duplicate/);
});

test('enforces the header count limit after merging defaults and case settings', () => {
  const headers = offset => Object.fromEntries(
    Array.from({ length: 11 }, (_, i) => ['X-' + (i + offset), 'v']));
  assert.throws(() => validateCollection({
    name: 'Combined limit', defaults: { headers: headers(0) },
    cases: [one({ headers: headers(11) })],
  }), /Too many/);
  assert.equal(Object.keys(validateCollection({
    name: 'Shared names', defaults: { headers: headers(0) },
    cases: [one({ headers: headers(0) })],
  }).cases[0].headers).length, 11);
});

test('rejects malformed collections and duplicate case identifiers', () => {
  const invalid = [
    {}, { name: 'X', cases: [] },
    { name: 'X', cases: [one(), one()] },
    { name: 'X', cases: [one({ id: '' })] },
    { name: 'X', cases: [one({ url: 'file:///etc/passwd' })] },
    { name: 'X', cases: [one({ method: 'POST' })] },
    { name: 'X', cases: [one({ retries: 4 })] },
    { name: 'X', cases: [one({ timeoutMs: 0 })] },
    { name: 'X', cases: [one({ retryDelayMs: 5001 })] },
    { name: 'X', cases: [one({ expectedStatus: 999 })] },
    { name: 'X', cases: [one({ unknown: 1 })] },
    { name: 'X', defaults: { unknown: 1 }, cases: [one()] },
    { name: 'X', cases: [one({ assertions: [{ kind: 'bad' }] })] },
    { name: 'X', cases: Array.from({ length: 101 }, (_, i) => one({ id: String(i) })) },
  ];
  for (const input of invalid) {
    assert.throws(() => validateCollection(input), { name: /TypeError|RangeError/ });
  }
});

test('reads bounded response bodies and preserves unicode text', async () => {
  const text = 'olá ☕';
  const result = await readBody(fakeResponse(200, text));
  assert.equal(result.text, text);
  assert.equal(result.sizeBytes, Buffer.byteLength(text));
});

test('rejects oversized streaming bodies without retaining all bytes', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(100)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBody({ body: stream }, 250), /byte limit/);
  assert.equal(cancelled, true);
});

test('handles empty bodies and fallback text-only responses', async () => {
  assert.deepEqual(await readBody({ body: null }), { text: '', sizeBytes: 0 });
  assert.deepEqual(await readBody({
    body: {}, text: async () => 'abc',
  }), { text: 'abc', sizeBytes: 3 });
  await assert.rejects(readBody({ body: {}, text: async () => 'abcd' }, 3), /byte limit/);
});

test('executes status and body assertions without exposing response content', async () => {
  const item = validateCollection(collection([one({
    assertions: [
      { kind: 'json', path: '/ok', equals: true },
      { kind: 'header', name: 'content-type', contains: 'json' },
    ],
  })])).cases[0];
  const result = await executeCase(item, {
    fetchImpl: async () => fakeResponse(200, '{"ok":true,"secret":"not in result"}',
      { 'content-type': 'application/json' }),
  });
  assert.equal(result.passed, true);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].checks.length, 3);
  assert.equal(JSON.stringify(result).includes('not in result'), false);
});

test('returns failed status checks without throwing', async () => {
  const item = validateCollection(collection([one()])).cases[0];
  const result = await executeCase(item, { fetchImpl: async () => fakeResponse(503) });
  assert.equal(result.passed, false);
  assert.equal(result.status, 503);
  assert.equal(result.attempts[0].checks[0].passed, false);
});

test('does not read a HEAD response body', async () => {
  const item = validateCollection(collection([one({ method: 'HEAD' })])).cases[0];
  const result = await executeCase(item, {
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'HEAD');
      return { status: 200, headers: new Headers(), body: {
        getReader() { throw new Error('HEAD body must not be read'); },
      } };
    },
  });
  assert.equal(result.passed, true);
  assert.equal(result.attempts[0].sizeBytes, 0);
});

test('uses manual redirects and a bounded AbortSignal', async () => {
  const item = validateCollection(collection([one({ timeoutMs: 50 })])).cases[0];
  const result = await executeCase(item, {
    fetchImpl: async (url, options) => {
      assert.equal(url, item.url);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.signal instanceof AbortSignal, true);
      assert.equal(options.method, 'GET');
      return fakeResponse(302);
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.status, 302);
});

test('retries failed assertions and stops after a successful attempt', async () => {
  const item = validateCollection(collection([one({
    retries: 3, retryDelayMs: 5,
  })])).cases[0];
  let requests = 0;
  const delays = [];
  const result = await executeCase(item, {
    fetchImpl: async () => fakeResponse(++requests === 3 ? 200 : 503),
    sleep: async ms => delays.push(ms),
  });
  assert.equal(result.passed, true);
  assert.equal(requests, 3);
  assert.equal(result.attempts.length, 3);
  assert.deepEqual(delays, [5, 5]);
});

test('bounds retry attempts after repeated network errors', async () => {
  const item = validateCollection(collection([one({ retries: 2 })])).cases[0];
  let requests = 0;
  const result = await executeCase(item, {
    fetchImpl: async () => { requests++; throw new Error('token secret'); },
  });
  assert.equal(result.passed, false);
  assert.equal(requests, 3);
  assert.equal(result.attempts.length, 3);
  assert.equal(JSON.stringify(result).includes('token secret'), false);
});

test('records oversized body errors as sanitized failures', async () => {
  const item = validateCollection(collection([one()])).cases[0];
  const result = await executeCase(item, {
    fetchImpl: async () => fakeResponse(200, 'x'.repeat(1024 * 1024 + 1)),
  });
  assert.equal(result.passed, false);
  assert.match(result.attempts[0].error, /too large/);
});

test('runs a collection concurrently while preserving case order', async () => {
  const cases = Array.from({ length: 6 }, (_, i) => one({ id: 'case-' + i }));
  let active = 0;
  let maxActive = 0;
  const completed = [];
  const result = await runCollection(collection(cases), {
    concurrency: 3,
    fetchImpl: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 4));
      active--;
      return fakeResponse();
    },
    onResult: item => completed.push(item.id),
  });
  assert.equal(result.success, true);
  assert.equal(result.total, 6);
  assert.equal(result.passed, 6);
  assert.equal(result.failed, 0);
  assert.equal(maxActive, 3);
  assert.deepEqual(result.results.map(item => item.id), cases.map(item => item.id));
  assert.equal(completed.length, 6);
});

test('reports mixed outcomes and validates concurrency bounds', async () => {
  const cases = [one({ id: 'a', expectedStatus: 200 }), one({ id: 'b', expectedStatus: 201 })];
  const result = await runCollection(collection(cases), {
    fetchImpl: async () => fakeResponse(200),
  });
  assert.equal(result.success, false);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
  for (const concurrency of [0, 9, 1.5]) {
    await assert.rejects(runCollection(collection(cases), { concurrency }), RangeError);
  }
  await assert.rejects(runCollection(collection(cases), { onResult: 'not a function' }), TypeError);
});
