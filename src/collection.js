import { isRecord, validateAssertions, evaluateAssertions } from './assertions.js';

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CASES = 100;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const BLOCKED_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function objectKeys(value, allowed, name) {
  if (!isRecord(value)) throw new TypeError(name + ' must be an object');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError('Unknown ' + name + ' field: ' + key);
  }
}

function integer(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(name + ' must be an integer from ' + minimum + ' to ' + maximum);
  }
  return value;
}

function label(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new TypeError(name + ' must be nonempty text with at most ' + maximum + ' characters');
  }
  return value;
}

export function validateTarget(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Only HTTP(S) targets are supported');
  }
  if (url.username || url.password) throw new TypeError('Credentials in URLs are not supported');
  if (url.href.length > 2048) throw new RangeError('URL exceeds 2048 characters');
  if (url.hash) throw new TypeError('URL fragments are not supported');
  return url.href;
}

export function validateHeaders(input = {}) {
  objectKeys(input, [], 'headers');
  const entries = Object.entries(input);
  if (entries.length > 20) throw new RangeError('Too many request headers');
  const headers = {};
  for (const [name, value] of entries) {
    if (!HEADER_NAME.test(name) || BLOCKED_HEADERS.has(name.toLowerCase())) {
      throw new TypeError('Invalid or restricted request header');
    }
    if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) {
      throw new TypeError('Invalid request header value');
    }
    headers[name] = value;
  }
  return headers;
}

function validateSettings(input, name) {
  objectKeys(input, ['method', 'timeoutMs', 'expectedStatus', 'retries', 'retryDelayMs', 'headers'], name);
  const settings = {};
  if (own(input, 'method')) {
    if (!['GET', 'HEAD'].includes(input.method)) throw new RangeError('Only GET and HEAD supported');
    settings.method = input.method;
  }
  if (own(input, 'timeoutMs')) settings.timeoutMs = integer(input.timeoutMs, 'timeoutMs', 1, 120000);
  if (own(input, 'expectedStatus')) settings.expectedStatus = integer(input.expectedStatus, 'expectedStatus', 100, 599);
  if (own(input, 'retries')) settings.retries = integer(input.retries, 'retries', 0, 3);
  if (own(input, 'retryDelayMs')) settings.retryDelayMs = integer(input.retryDelayMs, 'retryDelayMs', 0, 5000);
  if (own(input, 'headers')) settings.headers = validateHeaders(input.headers);
  return settings;
}

export function validateCollection(collection) {
  objectKeys(collection, ['name', 'defaults', 'cases'], 'collection');
  label(collection.name, 'Collection name', 120);
  const defaults = validateSettings(collection.defaults ?? {}, 'defaults');
  if (!Array.isArray(collection.cases) || collection.cases.length < 1 ||
      collection.cases.length > MAX_CASES) {
    throw new RangeError('Collection must contain 1 to ' + MAX_CASES + ' cases');
  }
  const ids = new Set();
  const cases = collection.cases.map((item, index) => {
    objectKeys(item, ['id', 'url', 'method', 'timeoutMs', 'expectedStatus',
      'retries', 'retryDelayMs', 'headers', 'assertions'], 'case');
    const id = label(item.id, 'Case id', 100);
    if (ids.has(id)) throw new TypeError('Duplicate case id: ' + id);
    ids.add(id);
    const url = validateTarget(item.url);
    const settings = validateSettings(Object.fromEntries(
      Object.entries(item).filter(([key]) =>
        ['method', 'timeoutMs', 'expectedStatus', 'retries', 'retryDelayMs', 'headers'].includes(key))
    ), 'case settings');
    const assertions = validateAssertions(item.assertions ?? []);
    return {
      id, index, url,
      method: settings.method ?? defaults.method ?? 'GET',
      timeoutMs: settings.timeoutMs ?? defaults.timeoutMs ?? 5000,
      expectedStatus: settings.expectedStatus ?? defaults.expectedStatus ?? 200,
      retries: settings.retries ?? defaults.retries ?? 0,
      retryDelayMs: settings.retryDelayMs ?? defaults.retryDelayMs ?? 0,
      headers: { ...(defaults.headers ?? {}), ...(settings.headers ?? {}) },
      assertions,
    };
  });
  return { name: collection.name, cases };
}

export async function readBody(response, maxBytes = MAX_BODY_BYTES) {
  integer(maxBytes, 'maxBytes', 1, MAX_BODY_BYTES);
  if (!response.body) return { text: '', sizeBytes: 0 };
  if (typeof response.body.getReader !== 'function') {
    const text = await response.text();
    const sizeBytes = Buffer.byteLength(text, 'utf8');
    if (sizeBytes > maxBytes) throw new RangeError('Response body exceeded byte limit');
    return { text, sizeBytes };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let sizeBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sizeBytes += value.byteLength;
      if (sizeBytes > maxBytes) {
        await reader.cancel();
        throw new RangeError('Response body exceeded byte limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8'), sizeBytes };
}

function errorDescription(error) {
  if (error instanceof RangeError && /body exceeded/.test(error.message)) return 'Response too large';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Request timed out';
  return 'Request failed (' + (error?.name || 'unknown') + ')';
}

export async function executeCase(testCase, options = {}) {
  const request = options.fetchImpl ?? fetch;
  const wait = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const attempts = [];
  for (let attempt = 0; attempt <= testCase.retries; attempt++) {
    const startedAt = performance.now();
    try {
      const response = await request(testCase.url, {
        method: testCase.method,
        headers: testCase.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(testCase.timeoutMs),
      });
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const body = testCase.method === 'HEAD' ? { text: '', sizeBytes: 0 } : await readBody(response);
      const checks = evaluateAssertions([
        { kind: 'status', equals: testCase.expectedStatus },
        ...testCase.assertions,
      ], {
        status: response.status,
        headers: response.headers,
        body: body.text,
        sizeBytes: body.sizeBytes,
        durationMs,
      });
      const passed = checks.every(check => check.passed);
      attempts.push({
        attempt: attempt + 1, passed, status: response.status,
        durationMs, sizeBytes: body.sizeBytes, checks,
      });
      if (passed) break;
    } catch (error) {
      attempts.push({
        attempt: attempt + 1, passed: false,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        error: errorDescription(error),
        checks: [],
      });
    }
    if (attempt < testCase.retries && testCase.retryDelayMs) await wait(testCase.retryDelayMs);
  }
  const last = attempts.at(-1);
  return {
    id: testCase.id, url: testCase.url, method: testCase.method,
    passed: last.passed, status: last.status ?? null,
    durationMs: Math.round(attempts.reduce((sum, item) => sum + item.durationMs, 0) * 100) / 100,
    attempts,
  };
}

export async function runCollection(collection, options = {}) {
  const validated = validateCollection(collection);
  const concurrency = integer(options.concurrency ?? 2, 'concurrency', 1, 8);
  if (options.onResult !== undefined && typeof options.onResult !== 'function') {
    throw new TypeError('onResult must be a function');
  }
  const results = new Array(validated.cases.length);
  let next = 0;
  const startedAt = performance.now();
  async function worker() {
    while (next < validated.cases.length) {
      const index = next++;
      const result = await executeCase(validated.cases[index], options);
      results[index] = result;
      if (options.onResult) await options.onResult(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, () => worker()));
  const passed = results.filter(item => item.passed).length;
  const failed = results.length - passed;
  return {
    name: validated.name,
    total: results.length,
    passed, failed,
    success: failed === 0,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    results,
  };
}
