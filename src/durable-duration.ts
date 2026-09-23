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

function invalidDuration(text: string, field: string): TypeError {
  return new TypeError(
    `${field} must be a duration in whole seconds, such as '30s', '5m', '2h', '1d' or '1m30s' (got '${text}')`,
  );
}

function parseSegment(text: string, at: number, field: string): { seconds: number; next: number } {
  const numberEnd = scanWhile(text, at, isDigit);
  const multiplier = durationUnits.get(text.charAt(numberEnd));
  if (numberEnd === at || multiplier === undefined) {
    throw invalidDuration(text, field);
  }
  return { seconds: Number(text.slice(at, numberEnd)) * multiplier, next: numberEnd + 1 };
}

function parseDurationStep(
  text: string,
  at: number,
  field: string,
): { seconds: number; next: number } {
  if (text[at] === ' ') {
    return { seconds: 0, next: at + 1 };
  }
  return parseSegment(text, at, field);
}

function isCompleteDuration(text: string, at: number, seconds: number): boolean {
  return text.length > 0 && at === text.length && isWholeSeconds(seconds);
}

// A linear scan avoids backtracking on hostile strings. Milliseconds and
// fractions are rejected because the engine accepts only whole seconds.
function parseDurationText(text: string, field: string): number {
  let seconds = 0;
  let at = 0;
  for (let remaining = text.length; remaining > 0 && at < text.length; remaining -= 1) {
    const segment = parseDurationStep(text, at, field);
    seconds += segment.seconds;
    at = segment.next;
  }
  if (!isCompleteDuration(text, at, seconds)) {
    throw invalidDuration(text, field);
  }
  return seconds;
}

function scanWhile(text: string, from: number, accept: (character: string) => boolean): number {
  for (let at = from; at < text.length; at += 1) {
    if (!accept(text.charAt(at))) {
      return at;
    }
  }
  return text.length;
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
