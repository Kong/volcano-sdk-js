import { randomUUID } from 'node:crypto';
import {
  type JsonValue,
  type LogActivityResponse,
  type LogSearchEvent,
  type LogSearchRequest,
  type LogsResponse,
  VolcanoClient,
} from '../../src/index.js';

interface LogWorld {
  fixture: {
    api_url: string;
    anon_key: string;
    logs_access_token: string;
    function_id: string;
    function_name: string;
    project_id: string;
  };
  serviceClient?: {
    functions: {
      invoke(
        name: string,
        payload: { value: string; log_marker: string; log_ordinal: number },
      ): Promise<{
        error: Error | null;
        status: number | null;
        data: unknown;
      }>;
    };
  };
}

async function poll<T>(
  operation: () => Promise<T>,
  ready: (value: T) => boolean,
  seconds: number,
): Promise<T> {
  const deadline = performance.now() + seconds * 1000;
  for (;;) {
    const result = await operation();
    if (ready(result)) {
      return result;
    }
    if (performance.now() >= deadline) {
      throw new Error('Matching logs did not arrive before deadline');
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, deadline - performance.now())),
    );
  }
}

function data<T>(result: LogsResponse<T>): T {
  if (result.error !== null) {
    throw result.error;
  }
  if (result.data === null) {
    throw new Error('Log response was empty');
  }
  return result.data;
}

function ordinalOf(event: LogSearchEvent): number {
  const body: JsonValue = event.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Log body was not an object');
  }
  const ordinal = body['ordinal'];
  if (typeof ordinal !== 'number') {
    throw new TypeError('Log ordinal was not a number');
  }
  return ordinal;
}

class LogContract {
  readonly world: LogWorld;
  readonly client: VolcanoClient;
  readonly marker: string;
  readonly request: LogSearchRequest & { start_time: string; end_time?: string };

  constructor(world: LogWorld) {
    this.world = world;
    const clientConfig = {
      apiUrl: world.fixture.api_url,
      anonKey: world.fixture.anon_key,
      accessToken: world.fixture.logs_access_token,
      timeout: 10000,
    };
    this.client = new VolcanoClient(clientConfig);
    this.marker = `sdklogs${randomUUID().replaceAll('-', '')}`;
    this.request = {
      resource: { type: 'function', ids: [world.fixture.function_id] },
      q: this.marker,
      start_time: new Date(Date.now() - 300000).toISOString(),
    };
  }

  async emit(count: number): Promise<void> {
    const serviceClient = this.world.serviceClient;
    if (serviceClient === undefined) {
      throw new Error('Log contract requires a service client');
    }
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const response = await serviceClient.functions.invoke(this.world.fixture.function_name, {
        value: 'contract',
        log_marker: this.marker,
        log_ordinal: ordinal,
      });
      if (response.error !== null) {
        throw response.error;
      }
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ echoed: 'contract' });
    }
    this.request.end_time = new Date(Date.now() + 300000).toISOString();
  }

  async search(): Promise<LogSearchEvent[]> {
    const project = this.world.fixture.project_id;
    let page = await poll(
      async () => data(await this.client.logs.search(project, { ...this.request, limit: 100 })),
      (result) => result.data.length >= 3,
      240,
    );
    expect(page.data).toHaveLength(3);
    const expectedIds = new Set(page.data.map((event) => event.id));
    const events = [];
    let request: LogSearchRequest = { ...this.request, limit: 1 };
    for (let index = 0; index < 3; index++) {
      page = data(await this.client.logs.search(project, request));
      expect(page.limit).toBe(1);
      expect(page.data).toHaveLength(1);
      events.push(...page.data);
      if (!page.has_more) {
        break;
      }
      expect(page.next_cursor).toBeTruthy();
      if (page.next_cursor === undefined || page.next_cursor.length === 0) {
        throw new Error('Paginated logs omitted a cursor');
      }
      request = { ...request, cursor: page.next_cursor };
    }
    expect(page.has_more).toBe(false);
    expect(new Set(events.map((event) => event.id))).toEqual(expectedIds);
    return events;
  }

  async activity(): Promise<LogActivityResponse> {
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

  verifyEvents(events: LogSearchEvent[]): void {
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
    expect(events.map((event) => ordinalOf(event)).sort((left, right) => left - right)).toEqual([
      0, 1, 2,
    ]);
    const timestamps = [];
    for (const event of events) {
      expect(event.id).toBeTruthy();
      expect(event.body).toEqual({ marker: this.marker, ordinal: ordinalOf(event) });
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

  verifyActivity(response: LogActivityResponse): void {
    expect(response.total).toBe(1);
    expect(response.data).toHaveLength(2);
    expect(response.data.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(1);
    expect(
      response.data.reduce(
        (sum, bucket) => sum + (bucket.counts.resource_ids[this.world.fixture.function_id] ?? 0),
        0,
      ),
    ).toBe(1);
    expect(
      response.data.reduce((sum, bucket) => sum + (bucket.counts.levels['info'] ?? 0), 0),
    ).toBe(1);
  }
}

export { LogContract };
