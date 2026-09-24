import assert from 'node:assert/strict';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value), 'Expected an object');
  return value;
}

export function array(value: unknown): readonly unknown[] {
  assert.ok(Array.isArray(value), 'Expected an array');
  return value;
}

export function stringValue(value: unknown): string {
  assert.ok(typeof value === 'string', 'Expected a string');
  return value;
}
