import { expect, jest } from '@jest/globals';
import type { VolcanoClient } from '../../src/index.ts';
import type { DurableMessage, DurableMessageList } from '../../src/sdk-public-types.ts';

export const target = { functionName: 'checkout', executionId: 'exec-1', clientToken: 'ct-1' };

export function message(seq: number, overrides: Partial<DurableMessage> = {}): DurableMessage {
  return {
    id: `msg-${String(seq)}`,
    execution_id: 'exec-1',
    direction: 'out',
    seq,
    name: 'progress',
    data: { percent: seq * 10 },
    sender: { type: 'execution', user_id: null },
    status: 'published',
    delivered_at: null,
    sent_at: '2026-10-12T09:30:00Z',
    ...overrides,
  };
}

export const sent = message(1, {
  direction: 'in',
  name: 'address-confirmed',
  data: { address_id: 'addr_19' },
  sender: { type: 'anon', user_id: null },
  status: 'delivered',
  delivered_at: '2026-10-12T09:30:01Z',
});

export const page = (messages: DurableMessage[], hasMore = false): DurableMessageList => ({
  data: messages,
  has_more: hasMore,
});

export type TransportOperation = (...args: unknown[]) => Promise<{ data: unknown; status: number }>;
type TransportMock = jest.Mock<TransportOperation>;

interface MessagesTransport {
  sendDurableMessage: TransportMock;
  sendDurableMessageFromApplication: TransportMock;
  listDurableMessages: TransportMock;
  listDurableMessagesFromApplication: TransportMock;
}

export const resolving = (data: unknown, status = 200): TransportMock =>
  jest.fn<TransportOperation>().mockResolvedValue({ data, status });

function messagesTransport(overrides: Partial<MessagesTransport> = {}): MessagesTransport {
  return {
    sendDurableMessage: resolving(sent, 201),
    sendDurableMessageFromApplication: resolving(sent, 201),
    listDurableMessages: resolving(page([sent])),
    listDurableMessagesFromApplication: resolving(page([])),
    ...overrides,
  };
}

type ClientWithTransport = (
  overrides?: Partial<MessagesTransport>,
  credentials?: { accessToken?: string },
) => { volcano: VolcanoClient; transport: MessagesTransport };

export function mockClientFactory(Client: typeof VolcanoClient): ClientWithTransport {
  return (overrides = {}, credentials = {}) => {
    const transport = messagesTransport(overrides);
    const config = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      ...credentials,
      transportFactory: () => transport,
    };
    return { volcano: new Client(config), transport };
  };
}

export const options = (
  volcano: VolcanoClient,
  mode: 'anon' | 'session',
  headers: Record<string, string>,
): ReturnType<typeof expect.objectContaining> =>
  expect.objectContaining({ volcanoAuthorization: mode, volcanoClient: volcano, headers });

export const refused = (errorMessage: string): { data: null; status: null; error: Error } => ({
  data: null,
  status: null,
  error: new Error(errorMessage),
});
