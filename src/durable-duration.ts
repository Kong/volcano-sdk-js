interface Duration {
  days?: number | undefined;
  hours?: number | undefined;
  minutes?: number | undefined;
  seconds?: number | undefined;
}

const durationUnits = new Map([
  ['s', 1],
  ['m', 60],
  ['h', 3600],
  ['d', 86400],
]);
const durationFields = ['days', 'hours', 'minutes', 'seconds'];
const minWaitSeconds = 1;
const maxWaitSeconds = 31622400;

export function optionalDuration(value: unknown, field: string): Duration | undefined {
  return value === undefined ? undefined : toDuration(value, field);
}

// Waits must fit the platform's execution lifetime. Retry and poll delays are
// left to the engine's own bounds.
export function waitDuration(value: unknown): Duration {
  const duration = toDuration(value, 'wait');
  const seconds = durationSeconds(duration);
  if (seconds < minWaitSeconds) {
    throw new TypeError(`wait must be at least ${String(minWaitSeconds)} second`);
  }
  if (seconds > maxWaitSeconds) {
    throw new TypeError(`wait must be at most ${String(maxWaitSeconds)} seconds (366 days)`);
  }
  return duration;
}

function durationSeconds(duration: Duration): number {
  return (
    (duration.days ?? 0) * 86400 +
    (duration.hours ?? 0) * 3600 +
    (duration.minutes ?? 0) * 60 +
    (duration.seconds ?? 0)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDuration(value: unknown, field: string): Duration {
  if (isObject(value)) {
    return checkedDurationObject(value, field);
  }
  return secondsToDuration(toSeconds(value, field));
}

// Preserve object identity and units: { minutes: 90 } stays what the caller
// wrote. Unknown keys must fail before the engine receives them.
function checkedDurationObject(value: Record<string, unknown>, field: string): Duration {
  const unknown = Object.keys(value).filter((key) => !durationFields.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(
      `${field} duration takes ${durationFields.join(', ')} (got ${unknown.join(', ')})`,
    );
  }
  if (!durationFields.some((key) => value[key] !== undefined)) {
    throw new TypeError(`${field} duration needs one of ${durationFields.join(', ')}`);
  }
  assertDurationParts(value, field);
  return value;
}

function assertDurationParts(
  value: Record<string, unknown>,
  field: string,
): asserts value is Record<string, unknown> & Duration {
  for (const key of durationFields) {
    const part = value[key];
    if (part !== undefined && !isWholeSeconds(part)) {
      throw new TypeError(`${field} duration ${key} must be a non-negative whole number`);
    }
  }
}

function isWholeSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function toSeconds(value: unknown, field: string): number {
  if (typeof value === 'number') {
    if (!isWholeSeconds(value)) {
      throw new TypeError(`${field} must be a non-negative whole number of seconds`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new TypeError(
      `${field} must be a duration string, a number of seconds, or a duration object`,
    );
  }
  return parseDurationText(value.trim(), field);
}

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

function isLowerLetter(character: string): boolean {
  return character >= 'a' && character <= 'z';
}

function invalidDuration(text: string, field: string): TypeError {
  return new TypeError(
    `${field} must be a duration in whole seconds, such as '30s', '5m', '2h', '1d' or '1m30s' (got '${text}')`,
  );
}

function parseSegment(text: string, at: number, field: string): { seconds: number; next: number } {
  const numberEnd = scanWhile(text, at, isDigit);
  const unitEnd = scanWhile(text, numberEnd, isLowerLetter);
  const multiplier = durationUnits.get(text.slice(numberEnd, unitEnd));
  if (numberEnd === at || multiplier === undefined) {
    throw invalidDuration(text, field);
  }
  return { seconds: Number(text.slice(at, numberEnd)) * multiplier, next: unitEnd };
}

// A linear scan avoids backtracking on hostile strings. Milliseconds and
// fractions are rejected because the engine accepts only whole seconds.
function parseDurationText(text: string, field: string): number {
  let seconds = 0;
  let segments = 0;
  let at = 0;
  while (at < text.length) {
    if (text[at] === ' ') {
      at += 1;
      continue;
    }
    const segment = parseSegment(text, at, field);
    seconds += segment.seconds;
    segments += 1;
    at = segment.next;
  }
  if (segments === 0 || !isWholeSeconds(seconds)) {
    throw invalidDuration(text, field);
  }
  return seconds;
}

function scanWhile(text: string, from: number, accept: (character: string) => boolean): number {
  let at = from;
  while (at < text.length && accept(text.charAt(at))) {
    at += 1;
  }
  return at;
}

function secondsToDuration(whole: number): Duration {
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  if (days > 0) {
    return { days, hours, minutes, seconds };
  }
  if (hours > 0) {
    return { hours, minutes, seconds };
  }
  if (minutes > 0) {
    return { minutes, seconds };
  }
  return { seconds };
}
