import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkEndpoint } from '../src/test-api.js';

const exec = promisify(execFile);

test('reports a passed duration assertion and preserves default output', async () => {
  const request = async () => ({ status: 204 });
  const measured = await checkEndpoint('http://localhost', 204, request, { maxDurationMs: 1000 });
  assert.equal(measured.passed, true);
  assert.equal(measured.durationPassed, true);
  assert.equal(measured.maxDurationMs, 1000);
  const legacy = await checkEndpoint('http://localhost', 204, request);
  assert.equal('durationPassed' in legacy, false);
});

test('fails on slow responses even when HTTP status matches', async () => {
  const slowRequest = async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    return { status: 200 };
  };
  const result = await checkEndpoint('http://localhost', 200, slowRequest, { maxDurationMs: 1 });
  assert.equal(result.passed, false);
  assert.equal(result.durationPassed, false);
});

test('rejects invalid duration limits before making requests', async () => {
  const request = () => { throw new Error('should not request'); };
  for (const value of [0, -1, 1.5, NaN, Infinity, 120001]) {
    await assert.rejects(checkEndpoint('http://localhost', 200, request, { maxDurationMs: value }), /Maximum duration/);
  }
});

test('CLI exposes duration assertion on a local HTTP server', async () => {
  const server = createServer((_req, res) => { res.writeHead(204); res.end(); }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await exec(process.execPath, ['src/cli.js', url, '204', '--max-duration', '1000']);
    const result = JSON.parse(stdout);
    assert.equal(result.passed, true);
    assert.equal(result.durationPassed, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
