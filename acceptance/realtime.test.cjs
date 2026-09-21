const { test, expect } = require('@jest/globals');
const { once } = require('node:events');
const { WebSocketServer } = require('ws');
const { VolcanoRealtime } = require('@volcano.dev/sdk/realtime');

test('the installed package loads its realtime dependencies and connects', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        const command = JSON.parse(line);
        if (command.connect) {
          socket.send(JSON.stringify({ id: command.id, connect: { client: 'acceptance' } }));
        }
      }
    });
  });
  const client = new VolcanoRealtime({
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    anonKey: 'acceptance',
    accessToken: 'acceptance',
  });
  try {
    await expect(client.connect()).resolves.toBeUndefined();
  } finally {
    client.disconnect();
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
