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
  const startedAt = performance.now();
  const response = await request(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  return {
    url: url.toString(),
    expectedStatus,
    actualStatus: response.status,
    passed: response.status === expectedStatus,
    durationMs,
  };
}
