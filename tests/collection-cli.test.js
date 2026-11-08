import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions, loadCollection, runCli, HELP } from '../src/collection-cli.js';

const output = () => {
  let text = '';
  return { write(chunk) { text += chunk; }, get text() { return text; } };
};

async function withFixture(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'api-test-studio-'));
  const server = createServer((req, res) => {
    res.writeHead(req.url === '/healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: req.url === '/healthy' ? 'ok' : 'down' }));
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const file = join(dir, 'collection.json');
    await writeFile(file, JSON.stringify({
      name: 'CLI integration',
      cases: [
        { id: 'health', url: base + '/healthy',
          assertions: [{ kind: 'json', path: '/status', equals: 'ok' }] },
        { id: 'failure', url: base + '/error', expectedStatus: 503 },
      ],
    }));
    return await callback({ dir, file, base });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

test('parses CLI flags and validates safe output paths', () => {
  const options = parseOptions(['--file', './collection.json', '--format', 'junit',
    '--concurrency', '4', '--output', './report.xml']);
  assert.equal(options.format, 'junit');
  assert.equal(options.concurrency, 4);
  assert.equal(options.output.endsWith('report.xml'), true);
  assert.deepEqual(parseOptions(['--help']), { help: true });
});

test('rejects unsupported CLI flags and invalid concurrency', () => {
  const invalid = [
    [], ['--file', 'x', '--format', 'html'],
    ['--file', 'x', '--concurrency', '0'],
    ['--file', 'x', '--concurrency', '9'],
    ['--file', 'x', '--concurrency', '2.5'],
    ['--file', 'x', '--unexpected'],
    ['--file', 'x', 'unexpected'],
    ['--file', 'x', '--output', 'x'],
  ];
  for (const args of invalid) assert.throws(() => parseOptions(args));
});

test('loads a JSON collection and rejects malformed JSON', async () => {
  await withFixture(async ({ dir, file }) => {
    const parsed = await loadCollection(file);
    assert.equal(parsed.cases.length, 2);
    const invalid = join(dir, 'invalid.json');
    await writeFile(invalid, '{not json');
    await assert.rejects(loadCollection(invalid), /valid JSON/);
    await writeFile(invalid, JSON.stringify({ name: 'X', cases: [] }));
    await assert.rejects(loadCollection(invalid), /1 to 100/);
    await writeFile(invalid, ' '.repeat(128 * 1024 + 1));
    await assert.rejects(loadCollection(invalid), /128 KiB/);
  });
});

test('runs local collection and emits JSON with exit code zero', async () => {
  await withFixture(async ({ file }) => {
    const stdout = output();
    const stderr = output();
    const exit = await runCli(['--file', file], { stdout, stderr });
    assert.equal(exit, 0);
    assert.equal(stderr.text, '');
    const report = JSON.parse(stdout.text);
    assert.equal(report.total, 2);
    assert.equal(report.passed, 2);
    assert.equal(report.success, true);
  });
});

test('writes a JUnit report to disk instead of stdout', async () => {
  await withFixture(async ({ dir, file }) => {
    const target = join(dir, 'junit.xml');
    const stdout = output();
    const stderr = output();
    const exit = await runCli(['--file', file, '--format', 'junit',
      '--output', target], { stdout, stderr });
    assert.equal(exit, 0);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /Report written/);
    assert.match(await readFile(target, 'utf8'), /testsuite/);
  });
});

test('returns exit code one when assertions fail', async () => {
  await withFixture(async ({ file, base }) => {
    const input = JSON.parse(await readFile(file, 'utf8'));
    input.cases[1].expectedStatus = 200;
    await writeFile(file, JSON.stringify(input));
    const stdout = output();
    const exit = await runCli(['--file', file, '--format', 'markdown'], {
      stdout, stderr: output(),
    });
    assert.equal(exit, 1);
    assert.match(stdout.text, /FAIL/);
    assert.match(stdout.text, /## Failures/);
  });
});

test('returns exit code two for input errors and displays help', async () => {
  const stdout = output();
  const stderr = output();
  assert.equal(await runCli(['--help'], { stdout, stderr }), 0);
  assert.equal(stdout.text, HELP + '\n');
  assert.equal(await runCli([], { stdout: output(), stderr }), 2);
  assert.match(stderr.text, /--file is required/);
});
