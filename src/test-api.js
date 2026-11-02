/** Bounded API status checker. A developer explicitly chooses the endpoint. */
export async function checkEndpoint(input, expectedStatus = 200, request = fetch) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Only HTTP(S) allowed');
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)
    throw new RangeError('Invalid expected status');
  const response = await request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  return { url: url.toString(), expectedStatus, actualStatus: response.status, passed: response.status === expectedStatus };
}
