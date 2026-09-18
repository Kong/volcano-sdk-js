const { LogContract } = require('./contract/logs.js');

function contractEvents() {
  const contract = new LogContract({
    fixture: {
      api_url: 'https://api.test',
      anon_key: 'anon',
      logs_access_token: 'project-token',
      function_id: 'function-id',
    },
  });
  const events = [0, 1, 2].map((ordinal) => ({
    id: `event-${ordinal}`,
    timestamp: `2026-09-18T12:00:0${2 - ordinal}Z`,
    body: { marker: contract.marker, ordinal },
    resource: { type: 'function', id: 'function-id' },
    level: 'info',
  }));
  return { contract, events };
}

test('log contract accepts structured events and rejects duplicate or mismatched events', () => {
  const { contract, events } = contractEvents();
  contract.verifyEvents(events);
  expect(() => contract.verifyEvents([events[0], events[0], events[2]])).toThrow();
  events[1].resource.id = 'another-function';
  expect(() => contract.verifyEvents(events)).toThrow();
});

test('log activity contract rejects counts from a different resource', () => {
  const { contract } = contractEvents();
  const response = {
    total: 1,
    data: [
      { total: 1, counts: { resource_ids: { 'function-id': 1 }, levels: { info: 1 } } },
      { total: 0, counts: { resource_ids: {}, levels: {} } },
    ],
  };
  contract.verifyActivity(response);
  response.data[0].counts.resource_ids = { 'another-function': 1 };
  expect(() => contract.verifyActivity(response)).toThrow();
});

test.each([-120000, 120000])('log bounds allow server clock skew of %s ms', async (skew) => {
  const fixture = {
    api_url: 'https://api.test',
    anon_key: 'anon',
    logs_access_token: 'project-token',
    function_id: 'function-id',
    function_name: 'function',
  };
  const serviceClient = {
    functions: {
      invoke: jest.fn().mockResolvedValue({ status: 200, data: { echoed: 'contract' } }),
    },
  };
  const contract = new LogContract({ fixture, serviceClient });
  const serverTime = Date.now() + skew;
  await contract.emit(1);
  expect(Date.parse(contract.request.start_time)).toBeLessThan(serverTime);
  expect(Date.parse(contract.request.end_time)).toBeGreaterThan(serverTime);
});
