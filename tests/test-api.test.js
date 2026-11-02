import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkEndpoint } from '../src/test-api.js';

test('checks status without following redirects', async () => {
  const server = createServer((_req, res) => { res.writeHead(204); res.end(); }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await checkEndpoint(url, 204)).passed, true);
    assert.equal((await checkEndpoint(url, 200)).passed, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('rejects non HTTP targets and impossible status', async () => {
  await assert.rejects(checkEndpoint('file:///etc/passwd'), /HTTP/);
  await assert.rejects(checkEndpoint('http://localhost', 900), /status/);
});
