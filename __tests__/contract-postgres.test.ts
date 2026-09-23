import type { PostgresChange } from '../src/realtime.ts';
import { ChangeObserver, verifyChange } from './contract/postgres-changes.ts';

class ObserverTransport {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, callback: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
    callbacks.add(callback);
    this.listeners.set(event, callbacks);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, context: unknown): void {
    for (const callback of this.listeners.get(event) ?? []) {
      callback(context);
    }
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

const row = { id: 'row', value: 'inserted', owner_id: 'user' };
const base: PostgresChange = {
  type: 'INSERT',
  schema: 'public',
  table: 'records',
  timestamp: '2026-09-18T12:00:00Z',
};

const mismatches: [PostgresChange, boolean][] = [
  [{ ...base, record: { ...row, id: 'wrong-row' } }, true],
  [{ ...base, id: 'wrong-row', mode: 'lightweight' }, false],
  [{ ...base, table: 'wrong-table', record: row }, true],
  [{ ...base, record: row, id: row.id }, true],
  [{ ...base, record: row, mode: 'lightweight' }, true],
];

test.each(mismatches)(
  'rejects mismatched Postgres notification identity: %j',
  (event, automatic) => {
    expect(() => {
      verifyChange(event, 'INSERT', 'records', row, automatic);
    }).toThrow();
  },
);

const matches: [PostgresChange, boolean][] = [
  [{ ...base, record: row }, true],
  [{ ...base, id: row.id, mode: 'lightweight' }, false],
];

test.each(matches)('accepts the matching notification: %j', (event, automatic) => {
  verifyChange(event, 'INSERT', 'records', row, automatic);
});

test.each([true, false])(
  'ignores other rows in observer callbacks (automatic=%s)',
  async (automatic) => {
    const callbacks: ((event: PostgresChange) => void)[] = [];
    const channel = {
      onPostgresChanges(
        _kind: string,
        _schema: string,
        _table: string,
        callback: (event: PostgresChange) => void,
      ) {
        callbacks.push(callback);
        return jest.fn();
      },
    };
    const observer = new ChangeObserver(channel, 'records', row.id);
    const event = (id: string): PostgresChange =>
      automatic ? { ...base, record: { ...row, id } } : { ...base, id, mode: 'lightweight' };
    callbacks.forEach((callback) => {
      callback(event('other'));
    });
    expect(observer.events).toEqual([]);
    expect(observer.inserts).toBe(0);
    expect(observer.wrongTable).toBe(0);
    const [all, inserts] = callbacks;
    if (all === undefined || inserts === undefined) {
      throw new Error('Expected Postgres callbacks');
    }
    all(event(row.id));
    inserts(event(row.id));
    expect(await observer.next(0)).toEqual(event(row.id));
    expect(observer.inserts).toBe(1);
    observer.close();
  },
);

test('timeout identifies delivery stage without exposing publication data or errors', async () => {
  jest.useFakeTimers();
  const callbacks: ((event: PostgresChange) => void)[] = [];
  const channel = {
    onPostgresChanges(
      _kind: string,
      _schema: string,
      _table: string,
      callback: (event: PostgresChange) => void,
    ) {
      callbacks.push(callback);
      return jest.fn();
    },
  };
  const client = new ObserverTransport();
  const secret = 'private-row-and-credential-canary';
  const observer = new ChangeObserver(channel, 'records', row.id, { client, automatic: true });
  try {
    client.emit('publication', {
      channel: 'project:postgres:public:records:user',
      data: { ...base, id: row.id, private: secret },
    });
    client.emit('publication', { channel: 'project:broadcast:other', data: { private: secret } });
    client.emit('error', new Error(secret));
    client.emit('disconnected', { reason: secret });
    const [all] = callbacks;
    if (all === undefined) {
      throw new Error('Expected Postgres callback');
    }
    all({ ...base, id: secret });
    const result = observer.next(0).catch((error: unknown) => {
      if (!(error instanceof Error)) {
        throw error;
      }
      return error.message;
    });
    jest.advanceTimersByTime(10000);
    expect(await result).toBe(
      'Postgres INSERT notification did not arrive within 10 seconds (automatic client; {"publications":1,"matchingPublications":1,"callbacks":1,"errors":1,"disconnects":1}; matched=0)',
    );
    expect(await result).not.toContain(secret);
  } finally {
    observer.close();
    jest.useRealTimers();
  }
  expect(
    ['publication', 'error', 'disconnected'].map((event) => client.listenerCount(event)),
  ).toEqual([0, 0, 0]);
});

test('timeout identifies a missing update for the lightweight client', async () => {
  jest.useFakeTimers();
  const observer = new ChangeObserver({ onPostgresChanges: () => jest.fn() }, 'records', row.id);
  try {
    const result = observer.next(1).catch((error: unknown) => {
      if (!(error instanceof Error)) {
        throw error;
      }
      return error.message;
    });
    jest.advanceTimersByTime(10000);
    expect(await result).toContain(
      'Postgres UPDATE notification did not arrive within 10 seconds (lightweight client;',
    );
  } finally {
    observer.close();
    jest.useRealTimers();
  }
});
