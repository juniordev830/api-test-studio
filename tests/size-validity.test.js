import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAssertion } from '../src/assertions.js';

test('size assertions reject invalid byte counts', () => {
  const assertion = { kind: 'size', minBytes: 0, maxBytes: 1024 };
  for (const value of [-1, NaN, 0.5, Infinity, undefined, '42']) {
    assert.equal(evaluateAssertion(assertion, { sizeBytes: value }).passed, false);
  }
  assert.equal(evaluateAssertion(assertion, { sizeBytes: 0 }).passed, true);
  assert.equal(evaluateAssertion(assertion, { sizeBytes: 1024 }).passed, true);
  assert.equal(evaluateAssertion(assertion, { sizeBytes: 1025 }).passed, false);
});
