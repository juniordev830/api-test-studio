import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkEndpoint } from '../src/test-api.js';

test('compares the response status with the expected status', async () => {
  const server = createServer((_req, res) => { res.writeHead(204); res.end(); }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const passed = await checkEndpoint(url, 204);
    assert.equal(passed.passed, true);
    assert.equal(typeof passed.durationMs, 'number');
    assert.equal((await checkEndpoint(url, 200)).passed, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('rejects non HTTP targets and impossible status', async () => {
  await assert.rejects(checkEndpoint('file:///etc/passwd'), /HTTP/);
  await assert.rejects(checkEndpoint('http://localhost', 900), /status/);
});

test('returns the redirect status without requesting the destination', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/redirect') res.writeHead(302, { Location: '/destination' });
    else res.writeHead(200);
    res.end();
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/redirect`;
    const result = await checkEndpoint(url, 302);
    assert.equal(result.actualStatus, 302);
    assert.equal(result.passed, true);
    assert.deepEqual(requests, ['/redirect']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
