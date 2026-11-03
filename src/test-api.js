/** Bounded API status checker. A developer explicitly chooses the endpoint. */
export async function checkEndpoint(input, expectedStatus = 200, request = fetch, options = {}) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Only HTTP(S) allowed');
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)
    throw new RangeError('Invalid expected status');
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!['GET', 'HEAD'].includes(method)) throw new RangeError('Only GET and HEAD are supported');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw new RangeError('Timeout must be between 1 and 120000 ms');
  const expectedHeaders = options.expectedHeaders ?? [];
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length > 16)
    throw new RangeError('Expected headers must be an array of at most 16 entries');
  const headerExpectations = expectedHeaders.map(entry => {
    if (typeof entry !== 'string' || entry.length > 1152)
      throw new TypeError('Expected header must be a name:value string');
    const colon = entry.indexOf(':');
    const name = entry.slice(0, colon).trim();
    const value = entry.slice(colon + 1).trim();
    if (colon <= 0 || name.length > 128 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        value.length > 1024 || /[\r\n]/.test(value))
      throw new TypeError('Invalid expected header');
    return { name: name.toLowerCase(), value };
  });
  const startedAt = performance.now();
  const response = await request(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const headerChecks = headerExpectations.map(({ name, value }) => ({
    name,
    passed: response.headers.get(name) === value,
  }));
  return {
    url: url.toString(),
    expectedStatus,
    actualStatus: response.status,
    passed: response.status === expectedStatus && headerChecks.every(check => check.passed),
    durationMs,
    headerChecks, // Do not echo expected/received header values (may contain secrets).
  };
}
