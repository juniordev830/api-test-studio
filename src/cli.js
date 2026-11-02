import { checkEndpoint } from './test-api.js';
const [endpoint, status = '200'] = process.argv.slice(2);
if (!endpoint) {
  console.error('Usage: node src/cli.js http://127.0.0.1:3000/health 200');
  process.exitCode = 2;
} else {
  try {
    const output = await checkEndpoint(endpoint, Number(status));
    console.log(JSON.stringify(output, null, 2));
    if (!output.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
