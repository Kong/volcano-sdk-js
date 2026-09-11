const { EventEmitter, once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

async function publishAndReceive(publisher, messages, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const received = once(messages, message.value, { signal: controller.signal });
    const [, [data]] = await Promise.all([publisher.send(message), received]);
    expect(data).toEqual(message);
    return data;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function verifyBroadcastPause(world) {
  const messages = new EventEmitter();
  const delivered = [];
  world.subscriber.on('message', (message) => {
    delivered.push(message);
    messages.emit(message.value, message);
  });
  const baseline = { ...world.realtimeMessage, value: world.realtimeMessage.value + '-baseline' };
  await publishAndReceive(world.publisher, messages, baseline);
  await world.subscriber.unsubscribe();
  delivered.length = 0;
  await world.publisher.send({
    ...world.realtimeMessage,
    value: world.realtimeMessage.value + '-paused',
  });
  await delay(1_000);
  expect(delivered).toEqual([]);
  await world.subscriber.subscribe();
  return publishAndReceive(world.publisher, messages, world.realtimeMessage);
}

module.exports = { verifyBroadcastPause };
