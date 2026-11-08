import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRecord, jsonType, parsePointer, lookupPointer, validateAssertion,
  validateAssertions, evaluateAssertion, evaluateAssertions,
} from '../src/assertions.js';

const sample = {
  status: 201,
  headers: new Headers({ 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'abc-123' }),
  body: JSON.stringify({
    status: 'ok', total: 0, enabled: false, empty: null,
    nested: { 'a/b': { '~key': [1, 2, { active: true }] } },
  }),
  durationMs: 14.5,
  sizeBytes: 100,
};

test('recognizes records without treating arrays or null as records', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
});

test('reports exact JSON types including arrays and null', () => {
  assert.equal(jsonType(null), 'null');
  assert.equal(jsonType([]), 'array');
  assert.equal(jsonType({}), 'object');
  assert.equal(jsonType(0), 'number');
  assert.equal(jsonType(false), 'boolean');
  assert.equal(jsonType(''), 'string');
});

test('parses RFC 6901 pointers and unescapes in the correct order', () => {
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/a~1b/~0key/2'), ['a/b', '~key', '2']);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/~01'), ['~1']);
});

test('rejects invalid JSON pointer escapes', () => {
  for (const pointer of ['a', '/~', '/~2', '/a~x', null, undefined]) {
    assert.throws(() => parsePointer(pointer), TypeError);
  }
});

test('looks up nested arrays and object properties safely', () => {
  const document = JSON.parse(sample.body);
  assert.deepEqual(lookupPointer(document, '/nested/a~1b/~0key/2/active'), {
    found: true, value: true,
  });
  assert.deepEqual(lookupPointer(document, '/nested/a~1b/~0key/0'), {
    found: true, value: 1,
  });
  assert.deepEqual(lookupPointer(document, ''), { found: true, value: document });
});

test('distinguishes absent paths from falsy and null values', () => {
  const document = JSON.parse(sample.body);
  assert.deepEqual(lookupPointer(document, '/total'), { found: true, value: 0 });
  assert.deepEqual(lookupPointer(document, '/enabled'), { found: true, value: false });
  assert.deepEqual(lookupPointer(document, '/empty'), { found: true, value: null });
  assert.deepEqual(lookupPointer(document, '/missing'), { found: false });
});

test('rejects array indices that are not canonical or in bounds', () => {
  const document = { list: [1, 2] };
  for (const path of ['/list/02', '/list/-1', '/list/2', '/list/foo', '/list/1.0']) {
    assert.deepEqual(lookupPointer(document, path), { found: false });
  }
});

test('does not walk inherited object properties', () => {
  const document = { data: { safe: true } };
  assert.deepEqual(lookupPointer(document, '/data/toString'), { found: false });
  assert.deepEqual(lookupPointer(document, '/data/__proto__'), { found: false });
});

test('validates supported assertion kinds and rejects unknown fields', () => {
  for (const kind of ['status', 'header', 'text', 'json', 'duration', 'size']) {
    const valid = {
      status: { kind, equals: 200 },
      header: { kind, name: 'x-id', exists: true },
      text: { kind, contains: 'ok' },
      json: { kind, path: '/x', exists: false },
      duration: { kind, maxMs: 100 },
      size: { kind, maxBytes: 200 },
    }[kind];
    assert.equal(validateAssertion(valid), valid);
    assert.throws(() => validateAssertion({ ...valid, unexpected: 1 }), /Unknown/);
  }
  assert.throws(() => validateAssertion({ kind: 'script' }), /supported kind/);
});

test('validates bounds and types for each matcher', () => {
  const invalid = [
    { kind: 'status', equals: 99 },
    { kind: 'status', equals: 600 },
    { kind: 'header', name: 'bad name', exists: true },
    { kind: 'header', name: 'x' },
    { kind: 'header', name: 'x', exists: 'true' },
    { kind: 'text' },
    { kind: 'text', contains: '' },
    { kind: 'json', path: '/x' },
    { kind: 'json', path: '/x', type: 'integer' },
    { kind: 'duration', maxMs: -1 },
    { kind: 'duration', maxMs: Infinity },
    { kind: 'size' },
    { kind: 'size', minBytes: 20, maxBytes: 10 },
  ];
  for (const assertion of invalid) {
    assert.throws(() => validateAssertion(assertion), { name: /TypeError|RangeError/ });
  }
});

test('limits the number of assertions in one case', () => {
  assert.deepEqual(validateAssertions([]), []);
  assert.throws(() => validateAssertions({}), /array/);
  assert.throws(() => validateAssertions(Array.from({ length: 31 }, () =>
    ({ kind: 'status', equals: 200 }))), /at most 30/);
});

test('matches response status and reports mismatch', () => {
  assert.equal(evaluateAssertion({ kind: 'status', equals: 201 }, sample).passed, true);
  const result = evaluateAssertion({ kind: 'status', equals: 200 }, sample);
  assert.equal(result.passed, false);
  assert.match(result.message, /201/);
});

test('matches case-insensitive headers and substring conditions', () => {
  assert.equal(evaluateAssertion({
    kind: 'header', name: 'CONTENT-TYPE', contains: 'json', exists: true,
  }, sample).passed, true);
  assert.equal(evaluateAssertion({
    kind: 'header', name: 'x-request-id', equals: 'abc-123',
  }, sample).passed, true);
  assert.equal(evaluateAssertion({
    kind: 'header', name: 'missing', exists: false,
  }, sample).passed, true);
  assert.equal(evaluateAssertion({
    kind: 'header', name: 'missing', exists: true,
  }, sample).passed, false);
});

test('supports plain object headers for synthetic responses', () => {
  const response = { ...sample, headers: { 'X-Flag': 'yes' } };
  assert.equal(evaluateAssertion({
    kind: 'header', name: 'x-flag', equals: 'yes',
  }, response).passed, true);
});

test('matches text exactly or by substring without leaking response', () => {
  assert.equal(evaluateAssertion({ kind: 'text', contains: '"status":"ok"' }, sample).passed, true);
  assert.equal(evaluateAssertion({ kind: 'text', equals: sample.body }, sample).passed, true);
  const failed = evaluateAssertion({ kind: 'text', contains: 'secret' }, sample);
  assert.equal(failed.passed, false);
  assert.equal(failed.message.includes(sample.body), false);
});

test('matches JSON pointers, primitive values, arrays and object equality', () => {
  const cases = [
    { path: '/status', equals: 'ok' },
    { path: '/total', equals: 0, type: 'number' },
    { path: '/enabled', equals: false },
    { path: '/empty', equals: null, type: 'null' },
    { path: '/nested/a~1b/~0key', equals: [1, 2, { active: true }] },
    { path: '/missing', exists: false },
  ];
  for (const condition of cases) {
    assert.equal(evaluateAssertion({ kind: 'json', ...condition }, sample).passed, true);
  }
  assert.equal(evaluateAssertion({
    kind: 'json', path: '/nested', equals: { 'a/b': { '~key': [1, 2] } },
  }, sample).passed, false);
});

test('rejects malformed JSON in response without throwing', () => {
  const result = evaluateAssertion({
    kind: 'json', path: '/status', equals: 'ok',
  }, { ...sample, body: '{bad' });
  assert.equal(result.passed, false);
  assert.match(result.message, /not valid JSON/);
});

test('checks duration and body byte boundaries inclusively', () => {
  assert.equal(evaluateAssertion({ kind: 'duration', maxMs: 14.5 }, sample).passed, true);
  assert.equal(evaluateAssertion({ kind: 'duration', maxMs: 14 }, sample).passed, false);
  assert.equal(evaluateAssertion({ kind: 'size', minBytes: 100, maxBytes: 100 }, sample).passed, true);
  assert.equal(evaluateAssertion({ kind: 'size', maxBytes: 99 }, sample).passed, false);
});

test('evaluates multiple assertions preserving input order', () => {
  const results = evaluateAssertions([
    { kind: 'status', equals: 201 },
    { kind: 'status', equals: 200 },
    { kind: 'json', path: '/status', equals: 'ok' },
  ], sample);
  assert.deepEqual(results.map(result => result.passed), [true, false, true]);
  assert.deepEqual(results.map(result => result.kind), ['status', 'status', 'json']);
});
