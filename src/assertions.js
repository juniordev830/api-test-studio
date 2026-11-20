const ASSERTION_KINDS = new Set(['status', 'header', 'text', 'json', 'duration', 'size']);
const JSON_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new TypeError('JSON pointer must be empty or start with /');
  }
  return pointer.slice(1).split('/').map(segment => {
    if (/~(?![01])/.test(segment)) throw new TypeError('Invalid JSON pointer escape');
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

export function lookupPointer(document, pointer) {
  const segments = parsePointer(pointer);
  let value = document;
  for (const segment of segments) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= value.length || !own(value, index)) {
        return { found: false };
      }
      value = value[index];
    } else if (isRecord(value) && own(value, segment)) {
      value = value[segment];
    } else {
      return { found: false };
    }
  }
  return { found: true, value };
}

function requireNumber(value, name, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < minimum || value > maximum) {
    throw new TypeError(name + ' must be a finite number between ' + minimum + ' and ' + maximum);
  }
}

function requireText(value, name, maximum = 500) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new TypeError(name + ' must be nonempty text of at most ' + maximum + ' characters');
  }
}

function requireAllowedKeys(value, keys) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError('Unknown assertion field: ' + key);
  }
}

export function validateAssertion(assertion) {
  if (!isRecord(assertion) || !ASSERTION_KINDS.has(assertion.kind)) {
    throw new TypeError('Assertion must have a supported kind');
  }
  switch (assertion.kind) {
    case 'status':
      requireAllowedKeys(assertion, ['kind', 'equals']);
      if (!Number.isInteger(assertion.equals) || assertion.equals < 100 ||
          assertion.equals > 599) throw new TypeError('Invalid expected status');
      break;
    case 'header':
      requireAllowedKeys(assertion, ['kind', 'name', 'equals', 'contains', 'exists']);
      requireText(assertion.name, 'Header name', 100);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(assertion.name)) {
        throw new TypeError('Invalid header name');
      }
      if (own(assertion, 'exists') && typeof assertion.exists !== 'boolean') {
        throw new TypeError('Header exists must be boolean');
      }
      if (own(assertion, 'equals')) requireText(assertion.equals, 'Header equals');
      if (own(assertion, 'contains')) requireText(assertion.contains, 'Header contains');
      if (![ 'equals', 'contains', 'exists' ].some(key => own(assertion, key))) {
        throw new TypeError('Header assertion needs a comparison');
      }
      break;
    case 'text':
      requireAllowedKeys(assertion, ['kind', 'contains', 'equals']);
      if (own(assertion, 'contains')) requireText(assertion.contains, 'Text contains', 2000);
      if (own(assertion, 'equals') && typeof assertion.equals !== 'string') {
        throw new TypeError('Text equals must be a string');
      }
      if (!own(assertion, 'contains') && !own(assertion, 'equals')) {
        throw new TypeError('Text assertion needs a comparison');
      }
      break;
    case 'json':
      requireAllowedKeys(assertion, ['kind', 'path', 'equals', 'exists', 'type']);
      parsePointer(assertion.path);
      if (own(assertion, 'exists') && typeof assertion.exists !== 'boolean') {
        throw new TypeError('JSON exists must be boolean');
      }
      if (own(assertion, 'type') && !JSON_TYPES.has(assertion.type)) {
        throw new TypeError('Invalid JSON type');
      }
      if (!['equals', 'exists', 'type'].some(key => own(assertion, key))) {
        throw new TypeError('JSON assertion needs a comparison');
      }
      break;
    case 'duration':
      requireAllowedKeys(assertion, ['kind', 'maxMs']);
      requireNumber(assertion.maxMs, 'maxMs', 0, 120000);
      break;
    case 'size':
      requireAllowedKeys(assertion, ['kind', 'maxBytes', 'minBytes']);
      if (!own(assertion, 'maxBytes') && !own(assertion, 'minBytes')) {
        throw new TypeError('Size assertion needs a limit');
      }
      if (own(assertion, 'maxBytes')) requireNumber(assertion.maxBytes, 'maxBytes', 0, 1048576);
      if (own(assertion, 'minBytes')) requireNumber(assertion.minBytes, 'minBytes', 0, 1048576);
      if (own(assertion, 'maxBytes') && own(assertion, 'minBytes') &&
          assertion.minBytes > assertion.maxBytes) throw new TypeError('Invalid size range');
      break;
  }
  return assertion;
}

export function validateAssertions(assertions) {
  if (!Array.isArray(assertions) || assertions.length > 30) {
    throw new TypeError('Assertions must be an array with at most 30 entries');
  }
  return assertions.map(validateAssertion);
}

function equalJson(left, right) {
  if (Object.is(left, right)) return true;
  if (jsonType(left) !== jsonType(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, i) => equalJson(value, right[i]));
  }
  if (isRecord(left)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every(key => own(right, key) && equalJson(left[key], right[key]));
  }
  return false;
}

function getHeader(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : null;
}

export function evaluateAssertion(assertion, response) {
  validateAssertion(assertion);
  let passed = false;
  let message = assertion.kind + ' assertion failed';
  switch (assertion.kind) {
    case 'status':
      passed = response.status === assertion.equals;
      message = 'Expected HTTP ' + assertion.equals + ', received ' + response.status;
      break;
    case 'header': {
      const actual = getHeader(response.headers, assertion.name);
      passed = (!own(assertion, 'exists') || (actual !== null) === assertion.exists) &&
        (!own(assertion, 'equals') || actual === assertion.equals) &&
        (!own(assertion, 'contains') || (actual !== null && actual.includes(assertion.contains)));
      message = 'Header ' + assertion.name + ' did not match';
      break;
    }
    case 'text':
      passed = (!own(assertion, 'equals') || response.body === assertion.equals) &&
        (!own(assertion, 'contains') || response.body.includes(assertion.contains));
      message = 'Response text did not match';
      break;
    case 'json': {
      let document;
      try { document = JSON.parse(response.body); }
      catch { return { kind: assertion.kind, passed: false, message: 'Response is not valid JSON' }; }
      const found = lookupPointer(document, assertion.path);
      passed = (!own(assertion, 'exists') || found.found === assertion.exists) &&
        (!own(assertion, 'type') || (found.found && jsonType(found.value) === assertion.type)) &&
        (!own(assertion, 'equals') || (found.found && equalJson(found.value, assertion.equals)));
      message = 'JSON pointer ' + assertion.path + ' did not match';
      break;
    }
    case 'duration':
      passed = response.durationMs <= assertion.maxMs;
      message = 'Response exceeded maximum duration';
      break;
    case 'size':
      passed = (!own(assertion, 'maxBytes') || response.sizeBytes <= assertion.maxBytes) &&
        (!own(assertion, 'minBytes') || response.sizeBytes >= assertion.minBytes);
      message = 'Response size outside expected range';
      break;
  }
  return { kind: assertion.kind, passed, message: passed ? 'ok' : message };
}

export function evaluateAssertions(assertions, response) {
  return validateAssertions(assertions).map(assertion => evaluateAssertion(assertion, response));
}
