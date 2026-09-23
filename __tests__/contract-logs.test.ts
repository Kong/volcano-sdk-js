import type { LogActivityResponse, LogSearchEvent } from '../src/index.js';
import { LogContract } from './contract/logs.ts';

function contractEvents() {
  const contract = new LogContract({
    fixture: {
      api_url: 'https://api.test',
      anon_key: 'anon',
      logs_access_token: 'project-token',
      function_id: 'function-id',
      function_name: 'function',
      project_id: 'project',
    },
  });
  const events: LogSearchEvent[] = [0, 1, 2].map((ordinal) => ({
    id: `event-${String(ordinal)}`,
    timestamp: `2026-09-18T12:00:0${String(2 - ordinal)}Z`,
    body: { marker: contract.marker, ordinal },
    resource: { type: 'function', id: 'function-id' },
    level: 'info',
  }));
  return { contract, events };
}

test('log contract accepts structured events and rejects duplicate or mismatched events', () => {
  const { contract, events } = contractEvents();
  contract.verifyEvents(events);
  const [first, second, third] = events;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('Expected three log events');
  }
  expect(() => {
    contract.verifyEvents([first, first, third]);
  }).toThrow();
  second.resource.id = 'another-function';
  expect(() => {
    contract.verifyEvents(events);
  }).toThrow();
});

test('log activity contract rejects counts from a different resource', () => {
  const { contract } = contractEvents();
  const response: LogActivityResponse = {
    total: 1,
    data: [
      {
        start_time: '2026-09-18T12:00:00Z',
        end_time: '2026-09-18T12:01:00Z',
        total: 1,
        counts: { resource_ids: { 'function-id': 1 }, levels: { info: 1 }, regions: {} },
      },
      {
        start_time: '2026-09-18T12:01:00Z',
        end_time: '2026-09-18T12:02:00Z',
        total: 0,
        counts: { resource_ids: {}, levels: {}, regions: {} },
      },
    ],
  };
  contract.verifyActivity(response);
  const first = response.data[0];
  if (first === undefined) {
    throw new Error('Expected an activity bucket');
  }
  first.counts.resource_ids = { 'another-function': 1 };
  expect(() => {
    contract.verifyActivity(response);
  }).toThrow();
});

test.each([-120000, 120000])('log bounds allow server clock skew of %s ms', async (skew) => {
  const fixture = {
    api_url: 'https://api.test',
    anon_key: 'anon',
    logs_access_token: 'project-token',
    function_id: 'function-id',
    function_name: 'function',
    project_id: 'project',
  };
  const serviceClient = {
    functions: {
      invoke: jest
        .fn()
        .mockResolvedValue({ status: 200, data: { echoed: 'contract' }, error: null }),
    },
  };
  const contract = new LogContract({ fixture, serviceClient });
  const serverTime = Date.now() + skew;
  await contract.emit(1);
  expect(Date.parse(contract.request.start_time)).toBeLessThan(serverTime);
  if (contract.request.end_time === undefined) {
    throw new Error('Expected an end time');
  }
  expect(Date.parse(contract.request.end_time)).toBeGreaterThan(serverTime);
});
