import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkEndpoint } from '../src/test-api.js';

const run = promisify(execFile);

test('accepts HEAD and a custom timeout through the CLI', async () => {
  let receivedMethod;
  const server = createServer((req, res) => {
    receivedMethod = req.method;
    res.writeHead(204);
    res.end();
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await run(process.execPath, ['src/cli.js', url, '204', '--method', 'HEAD', '--timeout', '2000']);
    assert.equal(receivedMethod, 'HEAD');
    assert.equal(JSON.parse(stdout).passed, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('validates method and timeout before sending a request', async () => {
  const request = () => { throw new Error('request should not be sent'); };
  await assert.rejects(checkEndpoint('http://localhost', 200, request, { method: 'POST' }), /GET and HEAD/);
  await assert.rejects(checkEndpoint('http://localhost', 200, request, { timeoutMs: 0 }), /Timeout/);
});

test('verifies exact response headers through the CLI without printing their values', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Request-Id': 'secret-test-value' });
    res.end('{}');
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await run(process.execPath, [
      'src/cli.js', url, '200',
      '--expect-header', 'Content-Type:application/json',
      '--expect-header', 'x-request-id:secret-test-value',
    ]);
    const result = JSON.parse(stdout);
    assert.equal(result.passed, true);
    assert.deepEqual(result.headerChecks, [
      { name: 'content-type', passed: true },
      { name: 'x-request-id', passed: true },
    ]);
    assert.equal(stdout.includes('secret-test-value'), false);

    await assert.rejects(
      run(process.execPath, ['src/cli.js', url, '200', '--expect-header', 'x-request-id:wrong']),
      error => error.code === 1 && JSON.parse(error.stdout).passed === false,
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejects invalid header expectations before any network request', async () => {
  const request = () => { throw new Error('network request not expected'); };
  await assert.rejects(
    checkEndpoint('http://localhost', 200, request, { expectedHeaders: ['Bad Header:value'] }),
    /Invalid expected header/,
  );
  await assert.rejects(
    checkEndpoint('http://localhost', 200, request, { expectedHeaders: ['x:value\\r\\nattack'] }),
    /Invalid expected header/,
  );
  await assert.rejects(
    checkEndpoint('http://localhost', 200, request, { expectedHeaders: Array(17).fill('x:ok') }),
    /at most 16/,
  );
});
