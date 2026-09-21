const { randomUUID } = require('node:crypto');
const { VolcanoClient } = require('@volcano.dev/sdk');

async function poll(operation, ready, seconds) {
  const deadline = performance.now() + seconds * 1000;
  for (;;) {
    const result = await operation();
    if (ready(result)) return result;
    if (performance.now() >= deadline)
      throw new Error('Matching logs did not arrive before deadline');
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, deadline - performance.now())),
    );
  }
}

function data(result) {
  if (result.error) throw result.error;
  return result.data;
}

class LogContract {
  constructor(world) {
    this.world = world;
    this.client = new VolcanoClient({
      apiUrl: world.fixture.api_url,
      anonKey: world.fixture.anon_key,
      accessToken: world.fixture.logs_access_token,
      timeout: 10000,
    });
    this.marker = `sdklogs${randomUUID().replaceAll('-', '')}`;
    this.request = {
      resource: { type: 'function', ids: [world.fixture.function_id] },
      q: this.marker,
      start_time: new Date(Date.now() - 300000).toISOString(),
    };
  }

  async emit(count) {
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const response = await this.world.serviceClient.functions.invoke(
        this.world.fixture.function_name,
        { value: 'contract', log_marker: this.marker, log_ordinal: ordinal },
      );
      if (response.error) throw response.error;
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ echoed: 'contract' });
    }
    this.request.end_time = new Date(Date.now() + 300000).toISOString();
  }

  async search() {
    const project = this.world.fixture.project_id;
    let page = await poll(
      async () => data(await this.client.logs.search(project, { ...this.request, limit: 100 })),
      (result) => result.data.length >= 3,
      240,
    );
    expect(page.data).toHaveLength(3);
    const expectedIds = new Set(page.data.map((event) => event.id));
    const events = [];
    let request = { ...this.request, limit: 1 };
    for (let index = 0; index < 3; index++) {
      page = data(await this.client.logs.search(project, request));
      expect(page.limit).toBe(1);
      expect(page.data).toHaveLength(1);
      events.push(...page.data);
      if (!page.has_more) break;
      expect(page.next_cursor).toBeTruthy();
      request = { ...request, cursor: page.next_cursor };
    }
    expect(page.has_more).toBe(false);
    expect(new Set(events.map((event) => event.id))).toEqual(expectedIds);
    return events;
  }

  async activity() {
    return poll(
      async () =>
        data(
          await this.client.logs.activity(this.world.fixture.project_id, {
            ...this.request,
            bucket_count: 2,
          }),
        ),
      (response) => response.total >= 1,
      120,
    );
  }

  verifyEvents(events) {
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
    expect(events.map((event) => event.body.ordinal).sort()).toEqual([0, 1, 2]);
    const timestamps = [];
    for (const event of events) {
      expect(event.id).toBeTruthy();
      expect(event.body).toEqual({ marker: this.marker, ordinal: event.body.ordinal });
      expect(event.resource).toMatchObject({
        type: 'function',
        id: this.world.fixture.function_id,
      });
      expect(event.level).toBe('info');
      const timestamp = Date.parse(event.timestamp);
      expect(Number.isFinite(timestamp)).toBe(true);
      timestamps.push(timestamp);
    }
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  }

  verifyActivity(response) {
    expect(response.total).toBe(1);
    expect(response.data).toHaveLength(2);
    expect(response.data.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(1);
    expect(
      response.data.reduce(
        (sum, bucket) => sum + (bucket.counts.resource_ids[this.world.fixture.function_id] || 0),
        0,
      ),
    ).toBe(1);
    expect(response.data.reduce((sum, bucket) => sum + (bucket.counts.levels.info || 0), 0)).toBe(
      1,
    );
  }
}

module.exports = { LogContract };
