import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEndpoint } from '../src/test-api.js';

test('rejects credentials, fragments and oversized URLs before fetching', async () => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('should not fetch'); };
  for (const [url, error] of [
    ['https://user:pass@example.com/', /Credentials/],
    ['https://example.com/path#fragment', /fragments/],
    ['https://example.com/' + 'a'.repeat(2100), /2048/],
  ]) {
    await assert.rejects(checkEndpoint(url, 200, request), error);
  }
  assert.equal(calls, 0);
});

test('accepts a normal HTTP target and returns the observed status', async () => {
  const request = async () => ({status: 200, headers: {get: () => null}, body: null});
  const result = await checkEndpoint('https://example.com/status', 200, request);
  assert.equal(result.passed, true);
  assert.equal(result.actualStatus, 200);
});
