import * as http from 'node:http';

type HttpReply = readonly [status: number, payload: unknown, headers?: Record<string, string>];
type Respond = (target: string) => HttpReply | Promise<HttpReply>;

interface RecordedRequest {
  target: string;
  body: unknown;
  authorization: string | null;
}

export interface TestServer {
  requests: RecordedRequest[];
  url: string;
  targets: () => string[];
  close: () => Promise<void>;
}

async function respondToRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  body: string,
  { requests, respond }: { requests: RecordedRequest[]; respond: Respond },
): Promise<void> {
  const target = request.url;
  if (target === undefined) {
    response.writeHead(400);
    response.end();
    return;
  }
  requests.push({
    target,
    body: body.length > 0 ? JSON.parse(body) : null,
    authorization:
      request.headers.authorization !== undefined && request.headers.authorization.length > 0
        ? request.headers.authorization
        : null,
  });
  const [status, payload, extraHeaders] = await respond(target);
  const encoded = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(encoded),
    // The server stamps this on every response, errors included, so a test
    // that omits it would accept a client keying the retry off its absence.
    'X-Volcano-Version': 'test-build',
    ...extraHeaders,
  });
  response.end(encoded);
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

/** Starts a local HTTP server that answers from `respond` and records requests. */
export async function startServer(respond: Respond): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      void respondToRequest(request, response, body, { requests, respond }).catch((error: unknown) => {
        response.destroy(error instanceof Error ? error : new Error('Server response failed'));
      });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a bound TCP port');
  }
  return {
    requests,
    url: `http://127.0.0.1:${String(address.port)}`,
    targets: () => requests.map((request) => request.target),
    close: () => closeServer(server),
  };
}

export function apiServer(
  resolvePayload: unknown,
  { status = 200, resolveDelayMs = 0 }: { status?: number; resolveDelayMs?: number } = {},
): Promise<TestServer> {
  return startServer(async (target) => {
    if (!target.startsWith('/functions/resolve')) {
      return [200, { ok: 'via-api' }];
    }
    if (resolveDelayMs !== 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, resolveDelayMs);
      });
    }
    return [status, resolvePayload];
  });
}
