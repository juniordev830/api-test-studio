import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAssertion } from '../src/assertions.js';

test('deeply nested equality comparisons terminate with bounded depth', () => {
  let nested = 7;
  for (let i = 0; i < 70; i += 1) nested = [nested];
  const response = { body: JSON.stringify(nested) };
  const result = evaluateAssertion({ kind: 'json', path: '', equals: JSON.parse(response.body) }, response);
  assert.equal(result.passed, false);
});

test('normal nested JSON equality remains supported', () => {
  const response = { body: JSON.stringify({ user: { roles: ['candidate'] } }) };
  assert.equal(evaluateAssertion({ kind: 'json', path: '/user', equals: { roles: ['candidate'] } }, response).passed, true);
});
