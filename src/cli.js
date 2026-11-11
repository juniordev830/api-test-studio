import { checkEndpoint } from './test-api.js';
import { parseArgs } from 'node:util';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { method: { type: 'string' }, timeout: { type: 'string' }, 'max-duration': { type: 'string' } },
  });
  if (positionals.length < 1 || positionals.length > 2) {
    throw new Error('Usage: node src/cli.js URL [status] [--method GET|HEAD] [--timeout ms] [--max-duration ms]');
  }
  const [endpoint, status = '200'] = positionals;
  const options = {
    method: values.method?.toUpperCase() ?? 'GET',
    timeoutMs: values.timeout === undefined ? 5000 : Number(values.timeout),
    ...(values['max-duration'] === undefined ? {} : { maxDurationMs: Number(values['max-duration']) }),
  };
  const output = await checkEndpoint(endpoint, Number(status), fetch, options);
  console.log(JSON.stringify(output, null, 2));
  if (!output.passed) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
