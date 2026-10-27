// Every falsy value but the legacy document.all object. A Set matches with
// SameValueZero, so 0 also matches -0 and NaN matches NaN.
const falsyValues: ReadonlySet<unknown> = new Set([undefined, null, false, 0, 0n, '', Number.NaN]);

/** Whether `value` is falsy, for inputs that treat every falsy value as absent. */
export function isFalsy(value: unknown): boolean {
  return falsyValues.has(value);
}
