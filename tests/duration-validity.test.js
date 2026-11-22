import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAssertion } from '../src/assertions.js';

test('duration assertion requires a finite non-negative response measurement', () => {
  const assertion = { kind: 'duration', maxMs: 500 };
  for (const value of [-1, NaN, Infinity, undefined, '30']) {
    assert.equal(evaluateAssertion(assertion, { durationMs: value }).passed, false);
  }
  assert.equal(evaluateAssertion(assertion, { durationMs: 0 }).passed, true);
  assert.equal(evaluateAssertion(assertion, { durationMs: 500 }).passed, true);
  assert.equal(evaluateAssertion(assertion, { durationMs: 500.1 }).passed, false);
});
