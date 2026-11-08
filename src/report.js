import { isRecord } from './assertions.js';

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function validateRunResult(run) {
  if (!isRecord(run) || typeof run.name !== 'string' ||
      !Array.isArray(run.results) || !Number.isInteger(run.total) ||
      !Number.isInteger(run.passed) || !Number.isInteger(run.failed) ||
      run.total !== run.results.length || run.passed + run.failed !== run.total) {
    throw new TypeError('Invalid collection run result');
  }
  for (const item of run.results) {
    if (!isRecord(item) || typeof item.id !== 'string' ||
        typeof item.passed !== 'boolean' || !Array.isArray(item.attempts)) {
      throw new TypeError('Invalid case result');
    }
  }
  return run;
}

export function summary(run) {
  validateRunResult(run);
  const failures = run.results.filter(item => !item.passed).map(item => ({
    id: item.id,
    attempts: item.attempts.length,
    reasons: item.attempts.at(-1)?.checks?.filter(check => !check.passed)
      .map(check => check.message) ?? [],
    error: item.attempts.at(-1)?.error ?? null,
  }));
  return {
    name: run.name,
    total: run.total,
    passed: run.passed,
    failed: run.failed,
    success: run.failed === 0,
    durationMs: run.durationMs,
    failures,
  };
}

export function toJson(run, pretty = true) {
  validateRunResult(run);
  return JSON.stringify(run, null, pretty ? 2 : 0) + '\n';
}

export function toMarkdown(run) {
  validateRunResult(run);
  const lines = [
    '# API Test Studio — ' + markdownEscape(run.name),
    '',
    'Total: **' + run.total + '** | Passed: **' + run.passed +
      '** | Failed: **' + run.failed + '**',
    '',
    '| Case | Method | Status | Result | Attempts | Duration (ms) |',
    '| --- | --- | ---: | --- | ---: | ---: |',
  ];
  for (const item of run.results) {
    lines.push('| ' + markdownEscape(item.id) + ' | ' + markdownEscape(item.method) +
      ' | ' + (item.status ?? '—') + ' | ' + (item.passed ? 'PASS' : 'FAIL') +
      ' | ' + item.attempts.length + ' | ' + item.durationMs + ' |');
  }
  if (run.failed) {
    lines.push('', '## Failures', '');
    for (const failure of summary(run).failures) {
      lines.push('- **' + markdownEscape(failure.id) + '**: ' +
        markdownEscape([failure.error, ...failure.reasons].filter(Boolean).join('; ') || 'Unknown failure'));
    }
  }
  return lines.join('\n') + '\n';
}

export function toJUnit(run) {
  validateRunResult(run);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuite name="' + xmlEscape(run.name) + '" tests="' + run.total +
      '" failures="' + run.failed + '" errors="0" time="' +
      (run.durationMs / 1000).toFixed(3) + '">',
  ];
  for (const item of run.results) {
    lines.push('  <testcase name="' + xmlEscape(item.id) +
      '" classname="api-test-studio" time="' + (item.durationMs / 1000).toFixed(3) + '">');
    if (!item.passed) {
      const last = item.attempts.at(-1);
      const reason = [last?.error, ...(last?.checks ?? [])
        .filter(check => !check.passed).map(check => check.message)]
        .filter(Boolean).join('; ') || 'Assertion failed';
      lines.push('    <failure message="' + xmlEscape(reason) + '"/>');
    }
    lines.push('  </testcase>');
  }
  lines.push('</testsuite>');
  return lines.join('\n') + '\n';
}

export function formatReport(run, format = 'json') {
  switch (format) {
    case 'json': return toJson(run);
    case 'markdown': return toMarkdown(run);
    case 'junit': return toJUnit(run);
    default: throw new RangeError('Unknown report format: ' + format);
  }
}
