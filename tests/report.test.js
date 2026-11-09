import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRunResult, summary, toJson, toMarkdown, toJUnit, formatReport,
} from '../src/report.js';

const sample = {
  name: 'Health & <status>',
  total: 2, passed: 1, failed: 1, success: false, durationMs: 34.5,
  results: [
    {
      id: 'healthy', url: 'http://localhost/ok', method: 'GET',
      passed: true, status: 200, durationMs: 10, attempts: [
        { attempt: 1, passed: true, status: 200, durationMs: 10,
          checks: [{ kind: 'status', passed: true, message: 'ok' }] },
      ],
    },
    {
      id: 'error | <xml>', url: 'http://localhost/error', method: 'HEAD',
      passed: false, status: 503, durationMs: 24.5, attempts: [
        { attempt: 1, passed: false, status: 503, durationMs: 24.5,
          checks: [{ kind: 'status', passed: false, message: 'Expected "200" & received <503>' }] },
      ],
    },
  ],
};

test('accepts a well-formed run result', () => {
  assert.equal(validateRunResult(sample), sample);
});

test('rejects malformed run totals and case structures', () => {
  const invalid = [
    null, {}, { ...sample, total: 3 }, { ...sample, passed: 2 },
    { ...sample, results: null },
    { ...sample, results: [{ id: 'x', passed: true }] },
    { ...sample, results: [{ id: 2, passed: true, attempts: [] }, sample.results[1]] },
  ];
  for (const input of invalid) assert.throws(() => validateRunResult(input), TypeError);
});

test('summarizes failures without copying successful response bodies', () => {
  const result = summary(sample);
  assert.equal(result.name, sample.name);
  assert.equal(result.total, 2);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.success, false);
  assert.deepEqual(result.failures, [{
    id: 'error | <xml>', attempts: 1,
    reasons: ['Expected "200" & received <503>'],
    error: null,
  }]);
});

test('serializes JSON with optional pretty printing', () => {
  assert.deepEqual(JSON.parse(toJson(sample)), sample);
  assert.deepEqual(JSON.parse(toJson(sample, false)), sample);
  assert.equal(toJson(sample).endsWith('\n'), true);
  assert.equal(toJson(sample, false).includes('\n  '), false);
});

test('creates readable Markdown tables with escaped pipes', () => {
  const markdown = toMarkdown(sample);
  assert.match(markdown, /Health & <status>/);
  assert.match(markdown, /Total: \*\*2\*\*/);
  assert.match(markdown, /healthy \| GET \| 200 \| PASS/);
  assert.match(markdown, /error \\\| <xml>/);
  assert.match(markdown, /## Failures/);
  assert.match(markdown, /Expected "200"/);
});

test('creates valid XML escaping special characters in attributes', () => {
  const xml = toJUnit(sample);
  assert.match(xml, /<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /Health &amp; &lt;status&gt;/);
  assert.match(xml, /tests="2" failures="1"/);
  assert.match(xml, /name="error \| &lt;xml&gt;"/);
  assert.match(xml, /&quot;200&quot; &amp; received &lt;503&gt;/);
  assert.match(xml, /<failure message=/);
  assert.equal((xml.match(/<testcase /g) ?? []).length, 2);
});

test('omits failure section for a fully passing report', () => {
  const passed = {
    ...sample, total: 1, passed: 1, failed: 0, success: true,
    results: [sample.results[0]],
  };
  assert.equal(toMarkdown(passed).includes('## Failures'), false);
  assert.equal(toJUnit(passed).includes('<failure'), false);
  assert.deepEqual(summary(passed).failures, []);
});

test('handles network failures with no response status', () => {
  const network = {
    ...sample, total: 1, passed: 0, failed: 1,
    results: [{
      id: 'offline', method: 'GET', status: null, passed: false,
      durationMs: 1, attempts: [{
        attempt: 1, passed: false, error: 'Request timed out', checks: [],
      }],
    }],
  };
  assert.equal(summary(network).failures[0].error, 'Request timed out');
  assert.match(toMarkdown(network), /Request timed out/);
  assert.match(toJUnit(network), /Request timed out/);
});

test('dispatches supported report formats and rejects unknown ones', () => {
  assert.equal(formatReport(sample, 'json'), toJson(sample));
  assert.equal(formatReport(sample, 'markdown'), toMarkdown(sample));
  assert.equal(formatReport(sample, 'junit'), toJUnit(sample));
  assert.throws(() => formatReport(sample, 'html'), RangeError);
});
