import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runCollection, validateCollection } from './collection.js';
import { formatReport } from './report.js';

export const HELP = [
  'API Test Studio — collection runner (Node.js 22)',
  'Usage: node src/collection-cli.js --file collection.json [options]',
  '',
  'Options:',
  '  --file PATH          JSON collection (required)',
  '  --format FORMAT      json | markdown | junit (default json)',
  '  --output PATH        Write report to a file instead of stdout',
  '  --concurrency N      Concurrent cases, 1 to 8 (default 2)',
  '  --help               Show this help',
  '',
  'Exit codes: 0 all pass, 1 failed checks, 2 invalid input/runtime error.',
].join('\n');

export function parseOptions(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      format: { type: 'string' },
      output: { type: 'string' },
      concurrency: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (positionals.length) throw new TypeError('Unexpected positional arguments');
  if (values.help) return { help: true };
  if (!values.file) throw new TypeError('--file is required');
  const format = values.format ?? 'json';
  if (!['json', 'markdown', 'junit'].includes(format)) {
    throw new RangeError('--format must be json, markdown or junit');
  }
  const concurrency = values.concurrency === undefined ? 2 : Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new RangeError('--concurrency must be from 1 to 8');
  }
  const file = resolve(values.file);
  const output = values.output ? resolve(values.output) : null;
  if (output && file === output) throw new TypeError('Output must not overwrite input');
  return { file, format, output, concurrency };
}

export async function loadCollection(file) {
  const content = await readFile(file, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > 128 * 1024) {
    throw new RangeError('Collection file exceeds 128 KiB');
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TypeError('Collection file must contain valid JSON');
  }
  validateCollection(parsed);
  return parsed;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const options = parseOptions(argv);
    if (options.help) {
      stdout.write(HELP + '\n');
      return 0;
    }
    const collection = await loadCollection(options.file);
    const result = await runCollection(collection, { concurrency: options.concurrency });
    const report = formatReport(result, options.format);
    if (options.output) {
      await writeFile(options.output, report, { encoding: 'utf8', flag: 'w' });
      stderr.write('Report written to ' + options.output + '\n');
    } else {
      stdout.write(report);
    }
    return result.success ? 0 : 1;
  } catch (error) {
    stderr.write('Error: ' + error.message + '\n');
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
