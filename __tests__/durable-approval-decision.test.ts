/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  decide,
  decided,
  mockApprovalRuntime,
  resetApprovalDouble,
  restoreApprovalDouble,
} from './support/durable-approval-double.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockApprovalRuntime(), { virtual: true });

beforeEach(resetApprovalDouble);

afterEach(restoreApprovalDouble);

function resolvesTheOutcome(): void {
  it('resolves a denial rather than throwing', async () => {
    await expect(
      decide(() => Promise.resolve(decided({ status: 'denied', approved: false, comment: 'Wrong address' }))),
    ).resolves.toEqual({
      approved: false,
      status: 'denied',
      comment: 'Wrong address',
      decidedBy: { id: 'user-1', email: 'owner@example.com' },
      decidedAt: '2026-10-06T12:05:00Z',
    });
  });

  it.each([
    ['denied', true, false],
    ['approved', false, true],
    ['approved', 'yes', true],
  ])('derives approved from a %s status, ignoring approved: %p', async (status, approved, expected) => {
    await expect(decide(() => Promise.resolve(decided({ status, approved })))).resolves.toMatchObject({
      approved: expected,
      status,
    });
  });

  it('resolves an expired decision when the callback times out', async () => {
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(decide(() => Promise.reject(timeout))).resolves.toEqual({
      approved: false,
      status: 'expired',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it.each([
    ['another callback failure', Object.assign(new Error('boom'), { errorType: 'CallbackError' })],
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
  ])('rethrows %s', async (_case, failure) => {
    await expect(decide(() => rejectWithForeignValue(failure))).rejects.toBe(failure);
  });
}

function fillsInMissingFields(): void {
  it.each([
    ['left out', { status: 'approved' }],
    ['sent malformed', { status: 'approved', comment: 3, decided_by: 7, decided_at: 'today' }],
    ['sent as null', { status: 'approved', comment: null, decided_by: null, decided_at: null }],
  ])('fills in what the platform %s', async (_case, payload) => {
    await expect(decide(() => Promise.resolve(JSON.stringify(payload)))).resolves.toEqual({
      approved: true,
      status: 'approved',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it.each([
    ['without an email', { id: 'user-1' }],
    ['without an id', { email: 'owner@example.com' }],
    ['with a numeric id', { id: 1, email: 'owner@example.com' }],
    ['as text', 'owner@example.com'],
  ])('drops a decider %s', async (_case, decidedBy) => {
    await expect(decide(() => Promise.resolve(decided({ decided_by: decidedBy })))).resolves.toMatchObject({
      decidedBy: null,
    });
  });
}

function readsTheDecisionTime(): void {
  it.each([
    ['a bare year', '2026'],
    ['a date without a time', '2026-10-06'],
    ['a time without an offset', '2026-10-06T12:05:00'],
    ['a time without seconds', '2026-10-06T12:05Z'],
    ['a space for the T', '2026-10-06 12:05:00Z'],
    ['the basic format', '20261006T120500Z'],
    ['text before it', 'at 2026-10-06T12:05:00Z'],
    ['text after it', '2026-10-06T12:05:00Z UTC'],
    ['an interval', '2026-10-06T12:05:00Z/2026-10-07T12:05:00Z'],
    ['day zero', '2026-10-00T12:05:00Z'],
    ['an impossible day of any month', '2026-10-32T12:05:00Z'],
    ['an impossible day', '2026-02-30T12:05:00Z'],
    ['an impossible hour', '2026-10-06T24:00:00Z'],
    ['a three-digit hour', '2026-10-06T012:05:00Z'],
    ['an impossible month', '2026-13-06T12:05:00Z'],
    ['an impossible offset', '2026-10-06T12:05:00+24:00'],
    ['a leap second', '2026-10-06T23:59:60Z'],
    ['prose', 'Tue Oct 06 2026'],
    ['epoch milliseconds', 1_791_288_300_000],
  ])('drops a decision time given as %s', async (_case, decidedAt) => {
    await expect(decide(() => Promise.resolve(decided({ decided_at: decidedAt })))).resolves.toMatchObject({
      approved: true,
      decidedAt: null,
    });
  });

  it.each([
    ['fractional seconds and an offset', '2026-10-06T14:05:00.123+02:00'],
    ['a leap day', '2028-02-29T12:05:00Z'],
    ['the last day of a month', '2026-10-31T12:05:00Z'],
    ['the latest time and widest offset', '2026-10-06T23:59:59-23:59'],
  ])('keeps a decision time with %s', async (_case, decidedAt) => {
    await expect(decide(() => Promise.resolve(decided({ decided_at: decidedAt })))).resolves.toMatchObject({
      decidedAt,
    });
  });
}

function refusesUnreadableDecisions(): void {
  it('accepts a decision the runtime already parsed', async () => {
    await expect(decide(() => Promise.resolve({ status: 'denied', comment: 'No' }))).resolves.toMatchObject({
      approved: false,
      status: 'denied',
      comment: 'No',
    });
  });

  it('keeps the parse error behind a decision that is not JSON', async () => {
    const failure = await decide(() => Promise.resolve('approved')).then(
      () => new Error('Expected the decision to be refused'),
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it.each([
    ['text that is not JSON', 'approved'],
    ['a JSON scalar', '42'],
    ['JSON null', 'null'],
    ['an unknown status', decided({ status: 'expired' })],
    ['a status in another case', decided({ status: 'Approved' })],
    ['a status that is not text', decided({ status: true })],
    ['no status', JSON.stringify({ approved: true })],
    ['nothing', undefined],
  ])('refuses %s', async (_case, result) => {
    const failure = decide(() => Promise.resolve(result));
    await expect(failure).rejects.toBeInstanceOf(TypeError);
    await expect(failure).rejects.toThrow('Volcano resumed the approval with a decision this SDK cannot read');
  });
}

describe('the decision', () => {
  resolvesTheOutcome();
  fillsInMissingFields();
  readsTheDecisionTime();
  refusesUnreadableDecisions();
});
