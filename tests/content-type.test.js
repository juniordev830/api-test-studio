import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkEndpoint } from '../src/test-api.js';

const exec = promisify(execFile);

test('matches media type without parameters or case sensitivity', async () => {
  const request = async () => ({
    status: 200,
    headers: { get: key => key === 'content-type' ? 'Application/JSON; charset=utf-8' : null },
  });
  const result = await checkEndpoint('http://localhost', 200, request, {
    expectedContentType: 'application/json',
  });
  assert.equal(result.passed, true);
  assert.equal(result.actualContentType, 'application/json');
  assert.equal(result.contentTypePassed, true);
  const legacy = await checkEndpoint('http://localhost', 200, request);
  assert.equal('contentTypePassed' in legacy, false);
  assert.equal('actualContentType' in legacy, false);
});

test('missing and mismatched Content-Type fail explicitly', async () => {
  const missing = await checkEndpoint('http://localhost', 200,
    async () => ({ status: 200, headers: { get: () => null } }),
    { expectedContentType: 'application/json' });
  assert.equal(missing.passed, false);
  assert.equal(missing.actualContentType, null);

  const different = await checkEndpoint('http://localhost', 200,
    async () => ({ status: 200, headers: { get: () => 'text/plain' } }),
    { expectedContentType: 'application/json' });
  assert.equal(different.passed, false);
  assert.equal(different.contentTypePassed, false);
});

test('invalid MIME types reject before a request is sent', async () => {
  const request = () => { throw new Error('should not fetch'); };
  for (const value of ['', 'text/', 'application/json; charset=utf-8',
                       'bad type', null, 10, 'a'.repeat(129)]) {
    await assert.rejects(checkEndpoint('http://localhost', 200, request,
      { expectedContentType: value }), /Expected Content-Type/);
  }
});

test('CLI checks Content-Type of a local endpoint', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{}');
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await exec(process.execPath,
      ['src/cli.js', url, '200', '--content-type', 'application/json']);
    const result = JSON.parse(stdout);
    assert.equal(result.contentTypePassed, true);
    assert.equal(result.passed, true);

    await assert.rejects(
      exec(process.execPath,
        ['src/cli.js', url, '200', '--content-type', 'text/plain']),
      error => {
        assert.equal(error.code, 1);
        assert.equal(JSON.parse(error.stdout).contentTypePassed, false);
        return true;
      },
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
