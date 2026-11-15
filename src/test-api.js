/** Bounded API status checker. A developer explicitly chooses the endpoint. */
export async function checkEndpoint(input, expectedStatus = 200, request = fetch, options = {}) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Only HTTP(S) allowed');
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)
    throw new RangeError('Invalid expected status');
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxDurationMs = options.maxDurationMs;
  const expectedContentType = options.expectedContentType;
  if (!['GET', 'HEAD'].includes(method)) throw new RangeError('Only GET and HEAD are supported');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw new RangeError('Timeout must be between 1 and 120000 ms');
  if (maxDurationMs !== undefined && (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 120000))
    throw new RangeError('Maximum duration must be between 1 and 120000 ms');
  // Match the MIME media type, ignoring optional response parameters such as charset.
  // Validate first: malformed assertions must never trigger an HTTP request.
  if (expectedContentType !== undefined &&
      (typeof expectedContentType !== 'string' || expectedContentType.length > 128 ||
       !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(expectedContentType))) {
    throw new RangeError('Expected Content-Type must be a MIME media type (e.g. application/json)');
  }
  const startedAt = performance.now();
  const response = await request(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const statusPassed = response.status === expectedStatus;
  const durationPassed = maxDurationMs === undefined || durationMs <= maxDurationMs;
  const actualContentType = expectedContentType === undefined
    ? null
    : response.headers?.get?.('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? null;
  const contentTypePassed = expectedContentType === undefined ||
    actualContentType === expectedContentType.toLowerCase();
  return {
    url: url.toString(),
    expectedStatus,
    actualStatus: response.status,
    passed: statusPassed && durationPassed && contentTypePassed,
    durationMs,
    ...(maxDurationMs === undefined ? {} : { maxDurationMs, durationPassed }),
    ...(expectedContentType === undefined ? {} : {
      expectedContentType: expectedContentType.toLowerCase(), actualContentType, contentTypePassed,
    }),
  };
}
