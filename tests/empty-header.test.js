import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssertion, evaluateAssertion } from '../src/assertions.js';

test('supports comparing a present HTTP header with an empty value', () => {
  const assertion = { kind: 'header', name: 'X-Empty', equals: '' };
  assert.equal(validateAssertion(assertion), assertion);
  const response = { headers: new Headers({ 'X-Empty': '' }) };
  assert.equal(evaluateAssertion(assertion, response).passed, true);
});

test('does not treat an absent header as an empty value', () => {
  const assertion = { kind: 'header', name: 'X-Empty', equals: '' };
  assert.equal(evaluateAssertion(assertion, { headers: new Headers() }).passed, false);
});

test('header equality still rejects non-strings and oversized values', () => {
  for (const equals of [null, 0, false, 'x'.repeat(501)]) {
    assert.throws(() => validateAssertion({ kind: 'header', name: 'X-Empty', equals }), TypeError);
  }
});
