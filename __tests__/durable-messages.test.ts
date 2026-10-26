/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import {
  mockClientFactory,
  options,
  refused,
  resolving,
  sent,
  target,
  type TransportOperation,
} from './support/durable-messages-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

const invalidSends: [string, unknown[], string][] = [
  ['no target', [undefined, 'go'], 'target must be an object'],
  ['a null target', [null, 'go'], 'target must be an object'],
  ['a target that is a list', [['checkout', 'exec-1'], 'go'], 'target must be an object'],
  ['no function', [{ executionId: 'exec-1' }, 'go'], 'functionName must be a non-empty string'],
  [
    'a blank execution',
    [{ functionName: 'checkout', executionId: ' ' }, 'go'],
    'executionId must be a non-empty string',
  ],
  ['an empty project', [{ ...target, projectId: '' }, 'go'], 'projectId must be a non-empty string'],
  [
    'an empty client token',
    [{ ...target, clientToken: '' }, 'go'],
    'clientToken must be a non-empty string when provided',
  ],
  [
    'a client token that is not text',
    [{ ...target, clientToken: 7 }, 'go'],
    'clientToken must be a non-empty string when provided',
  ],
  [
    'a long client token',
    [{ ...target, clientToken: 't'.repeat(129) }, 'go'],
    'clientToken must be at most 128 characters',
  ],
  [
    'a client token that is not ASCII',
    [{ ...target, clientToken: 'tök' }, 'go'],
    'clientToken must be printable ASCII',
  ],
  ['no name', [target], 'name must be a non-empty string'],
  ['a blank name', [target, '  '], 'name must be a non-empty string'],
  ['a name that is not text', [target, 7], 'name must be a non-empty string'],
  ['a long name', [target, 'n'.repeat(238)], 'name must be at most 237 printable ASCII characters'],
  ['a name with a tab', [target, 'g\to'], 'name must be at most 237 printable ASCII characters'],
  [
    'an empty idempotency key',
    [target, 'go', null, { idempotencyKey: '' }],
    'idempotencyKey must be a non-empty string when provided',
  ],
  [
    'an idempotency key that is not text',
    [target, 'go', null, { idempotencyKey: 7 }],
    'idempotencyKey must be a non-empty string when provided',
  ],
  [
    'a long idempotency key',
    [target, 'go', null, { idempotencyKey: 'k'.repeat(256) }],
    'idempotencyKey must be at most 255 characters',
  ],
  [
    'an idempotency key that is not ASCII',
    [target, 'go', null, { idempotencyKey: 'confirm-café' }],
    'idempotencyKey must be printable ASCII',
  ],
  [
    'an idempotency key with a line break',
    [target, 'go', null, { idempotencyKey: 'a\nb' }],
    'idempotencyKey must be printable ASCII',
  ],
];

function sendsWithTheCallerCredential(): void {
  test('sends with the client credential, the client token, and the idempotency key', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.messages.send(
        target,
        'address-confirmed',
        { address_id: 'addr_19' },
        { idempotencyKey: 'confirm-addr_19' },
      ),
    ).resolves.toEqual({ data: sent, status: 201, error: null });
    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      { name: 'address-confirmed', data: { address_id: 'addr_19' } },
      options(volcano, 'anon', {
        'Idempotency-Key': 'confirm-addr_19',
        'X-Volcano-Client-Token': 'ct-1',
      }),
    );
    expect(transport.sendDurableMessage).not.toHaveBeenCalled();
  });

  test("sends as the signed-in user, leaving out what the caller didn't set", async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'user-token' });

    await volcano.durable.messages.send({ functionName: 'checkout', executionId: 'exec-1' }, 'go');

    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      { name: 'go' },
      options(volcano, 'session', {}),
    );
    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.[2]).toStrictEqual({
      name: 'go',
    });
  });
}

function sendsDataAndProjectMessages(): void {
  test.each([null, false, 0, ''])('sends %p data as it is', async (data) => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.messages.send(target, 'go', data);

    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.[2]).toStrictEqual({
      name: 'go',
      data,
    });
  });

  test('sends through the project with the owner session and no client token', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'owner-token' });

    await expect(
      volcano.durable.messages.send({ ...target, projectId: 'proj-1' }, 'go', 1, {
        idempotencyKey: 'k',
      }),
    ).resolves.toEqual({ data: sent, status: 201, error: null });
    expect(transport.sendDurableMessage).toHaveBeenCalledWith(
      'proj-1',
      'checkout',
      'exec-1',
      { name: 'go', data: 1 },
      options(volcano, 'session', { 'Idempotency-Key': 'k' }),
    );
    expect(transport.sendDurableMessageFromApplication).not.toHaveBeenCalled();
  });

  test('refuses the project route without a session', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.messages.send({ ...target, projectId: 'proj-1' }, 'go')).resolves.toEqual(
      refused('No active session'),
    );
    await expect(volcano.durable.messages.list({ ...target, projectId: 'proj-1' })).resolves.toEqual(
      refused('No active session'),
    );
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });
}

function validatesBeforeSending(): void {
  test.each(invalidSends)('refuses %s before reaching the platform', async (_case, args, error) => {
    const { volcano, transport } = clientWithTransport();
    const { messages } = volcano.durable;

    const result: unknown = Reflect.apply(messages.send.bind(messages), undefined, args);

    await expect(result).resolves.toEqual(refused(error));
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  test('accepts the longest name, client token, and idempotency key', async () => {
    const { volcano, transport } = clientWithTransport();
    const name = 'n'.repeat(237);
    const clientToken = 't'.repeat(128);
    const idempotencyKey = 'k'.repeat(255);

    await volcano.durable.messages.send({ ...target, clientToken }, name, null, {
      idempotencyKey,
    });

    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      { name, data: null },
      options(volcano, 'anon', {
        'Idempotency-Key': idempotencyKey,
        'X-Volcano-Client-Token': clientToken,
      }),
    );
  });
}

function escapesAndReportsFailures(): void {
  test('escapes every segment it puts in the path', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'owner-token' });
    const escaped = { functionName: 'check?out', executionId: 'exec#1' };

    await volcano.durable.messages.send(escaped, 'go');
    await volcano.durable.messages.send({ ...escaped, projectId: 'proj/1' }, 'go');
    await volcano.durable.messages.list({ ...escaped, projectId: 'proj 1' });

    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.slice(0, 2)).toEqual(['check%3Fout', 'exec%231']);
    expect(transport.sendDurableMessage).not.toHaveBeenCalled();
    expect(transport.listDurableMessages.mock.calls[0]?.slice(0, 3)).toEqual(['proj%201', 'check%3Fout', 'exec%231']);
  });

  test('refuses a message the platform answered with a malformed body', async () => {
    const { volcano } = clientWithTransport({
      sendDurableMessageFromApplication: resolving({ ...sent, seq: '1' }, 201),
    });

    await expect(volcano.durable.messages.send(target, 'go')).resolves.toEqual({
      data: null,
      status: null,
      error: new TypeError('Invalid durable response: Failed to send durable message'),
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      sendDurableMessageFromApplication: jest
        .fn<TransportOperation>()
        .mockImplementation(() => rejectWithForeignValue('socket hang up')),
    });

    await expect(volcano.durable.messages.send(target, 'go')).resolves.toMatchObject({
      data: null,
      status: null,
      error: { message: 'Failed to send durable message', cause: 'socket hang up' },
    });
  });
}

describe('durable.messages.send', () => {
  sendsWithTheCallerCredential();
  sendsDataAndProjectMessages();
  validatesBeforeSending();
  escapesAndReportsFailures();
});
