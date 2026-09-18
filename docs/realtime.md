---
title: 'Realtime'
description: 'Volcano Realtime enables live data synchronization using WebSockets. Subscribe to database changes, track user presence, and broadcast messages between clients.'
---

Volcano Realtime enables live data synchronization using WebSockets. Subscribe to database changes, track user presence, and broadcast messages between clients.

## Overview

The realtime module provides three types of channels:

- **Postgres Changes** - Get notified when rows are inserted, updated, or deleted
- **Presence** - Track who's online and their current state
- **Broadcast** - Send messages to all subscribers on a channel

All channels respect Row-Level Security, so users only receive notifications for data they're allowed to see.

## Installation

Realtime support is included with `@volcano.dev/sdk` and is imported from
`@volcano.dev/sdk/realtime`. Browser clients use the browser's native
`WebSocket`. Node.js clients use the SDK's `ws` dependency automatically unless
you provide a custom implementation.

## Getting Started

### Import and Initialize

```javascript
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';

const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
  accessToken: volcano.accessToken, // From auth session
});
```

The `anonKey` identifies the project and must include `realtime.connect` permission. The `accessToken` is the JWT from your authentication session. It's used to identify the user and enforce Row-Level Security.

### Browser Origins and CORS

Browser WebSocket connections include an `Origin` header. When CORS is enabled for your project, that origin must be listed in your project's auth CORS allowed origins. If the origin is not allowed, the WebSocket upgrade is rejected before authentication completes.

For local development, add your local app origin to the project's auth CORS settings, for example `http://localhost:3000`.

Server-side Node.js connections usually do not send an `Origin` header and are not blocked by browser CORS checks.

### Custom WebSocket Implementation

Most applications do not need this. The SDK uses the browser `WebSocket` in browsers and `ws` in Node.js. For Node.js tests or advanced server-side clients that need custom headers, pass `webSocket`:

```javascript
import WebSocket from 'ws';

class OriginWebSocket extends WebSocket {
  constructor(address, protocols, options = {}) {
    super(address, protocols, {
      ...options,
      headers: {
        ...options.headers,
        Origin: 'https://app.example.com',
      },
    });
  }
}

const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
  accessToken: volcano.accessToken,
  webSocket: OriginWebSocket,
});
```

### Connect to the Server

```javascript
await realtime.connect();
console.log('Connected to realtime server');
```

### Connection Events

Monitor the connection status:

```javascript
realtime.onConnect((ctx) => {
  console.log('Connected!');
  console.log('Client ID:', ctx.client);
  console.log('Latency:', ctx.latency, 'ms');
});

realtime.onDisconnect((ctx) => {
  console.log('Disconnected');
  console.log('Reason:', ctx.reason);
  console.log('Will reconnect:', ctx.reconnect);
});

realtime.onError((ctx) => {
  console.error('Connection error:', ctx.message);
});
```

The client automatically reconnects with exponential backoff when disconnected.

## Postgres Changes

Subscribe using a `schema:table` channel name. For automatic row loading, bind the
signed-in `volcano` client from the [quickstart](./README.md) and select its database.
Enable Postgres changes for the project and grant that user access to the table.

```javascript
realtime.setVolcanoClient(volcano);
realtime.setDatabaseName('app');
const channel = realtime.channel('public:posts', { type: 'postgres' });

channel.onPostgresChanges('*', 'public', 'posts', (change) => {
  console.log(change.type, change.schema, change.table, change.timestamp);
  if (change.record) {
    console.log('Current row:', change.record);
  } else {
    console.log('Changed row ID:', change.id);
  }
});
await channel.subscribe();
```

Insert and update notifications can load the current row through the authenticated
client. Automatic lookup requires a primary key named `id`; rapid updates may
have changed the row by the time the lookup runs. A failed lookup leaves the
lightweight notification available to the callback.

Set `autoFetch: false` when first creating a channel to receive its row ID and
`mode: 'lightweight'` without a row lookup. The `PostgresChange` type exposes both fields.

### Filter events and tables

```javascript
channel.onPostgresChanges('INSERT', 'public', 'posts', (change) => {
  console.log('Inserted:', change.record ?? change.id);
});
channel.onPostgresChanges('UPDATE', 'public', 'posts', (change) => {
  console.log('Updated:', change.record ?? change.id);
});
```

A subscription targets one table. Create a channel for each additional table:

```javascript
const comments = realtime.channel('public:comments', { type: 'postgres' });
comments.onPostgresChanges('*', 'public', 'comments', (change) => console.log(change));
await comments.subscribe();
```

### Row-Level Security and deletion

Volcano checks the current row against the subscriber's Row-Level Security policies.
Authenticated user subscriptions currently do not receive delete notifications after
the row is gone. Service-key subscriptions can receive deletion events with the
primary key in `old_record`; other deleted columns are not retained. See
[Postgres Changes](/platform/realtime/postgres-changes) for platform behavior.

Do not treat realtime delivery as a durable record of every database change.
Unsubscribe or remove channels during cleanup:

```javascript
channel.unsubscribe();
realtime.removeChannel('public:posts', 'postgres');
realtime.removeChannel('public:comments', 'postgres');
```

## Broadcast

Send ephemeral messages to all subscribers. Unlike database changes, broadcast messages aren't persisted - they're delivered only to currently connected clients.

### Setup

```javascript
const channel = realtime.channel('notifications', { type: 'broadcast' });
```

### Send and Receive Messages

```javascript
// Listen for messages
channel.on('notification', (data) => {
  console.log('Received:', data);
  showNotification(data.title, data.message);
});

// Listen for all events
channel.on('*', (data, ctx) => {
  console.log('Event received:', data);
});

await channel.subscribe();

// Send a message
await channel.send({
  event: 'notification',
  title: 'New Feature!',
  message: 'Check out our latest update',
});
```

### Use Cases

Broadcast is ideal for:

- **Typing indicators** - Show when someone is typing
- **Cursor position** - Share cursor locations in collaborative editing
- **System notifications** - Alert all users about maintenance
- **Game state** - Synchronize game events

### Example: Typing Indicator

```javascript
const channel = realtime.channel('chat-room-123', { type: 'broadcast' });

// Listen for typing events
channel.on('typing', (data) => {
  if (data.user_id !== currentUser.id) {
    showTypingIndicator(data.user_id);
  }
});

channel.on('stopped_typing', (data) => {
  hideTypingIndicator(data.user_id);
});

await channel.subscribe();

// Send typing events
let typingTimeout;
function onInputChange() {
  channel.send({
    event: 'typing',
    user_id: currentUser.id,
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    channel.send({
      event: 'stopped_typing',
      user_id: currentUser.id,
    });
  }, 2000);
}
```

## Presence

Observe the connections currently subscribed to a presence channel. The server
supplies each connection's `client` ID, authenticated `user` ID, and connection
metadata (`connInfo`). A user can have several connections.

```javascript
const channel = realtime.channel('lobby', { type: 'presence' });
channel.onPresenceSync((state) => {
  for (const [clientId, info] of Object.entries(state)) {
    console.log(clientId, info.user, info.connInfo);
  }
});
channel.on('join', (info) => console.log('Joined', info.client, info.user));
channel.on('leave', (info) => console.log('Left', info.client, info.user));
await channel.subscribe();

const state = channel.getPresenceState();
console.log('Online connections:', Object.keys(state).length);
```

Initial snapshots and join updates retain the same full client record. The
original handler continues to receive membership updates as other connections
join and leave. Unsubscribing clears the local roster; resubscribing reloads it.

`track(state)` stores application state locally. It does not publish that state
or replace the server's authenticated identity and metadata. Use a broadcast
channel to share application updates such as cursor positions.

```javascript
await channel.track({ status: 'working' });
// When this view is finished:
channel.unsubscribe();
```

## Managing Channels

### Auth Identity Changes

When `getToken` returns a token for the same user and project, existing channel
subscriptions remain active. A different user or project, or a changed opaque
credential, pauses channels and discards their underlying subscriptions.
Application event handlers remain registered; call `subscribe()` on each channel
to resume. Session identity is used only to scope local state; the server still
authenticates each credential.

`accessToken` is constructor configuration, not a live account-switch API. To
switch accounts explicitly, disconnect and create a new `VolcanoRealtime` client
with the new credentials. Assigning properties on an existing client does not
reauthenticate its WebSocket.

### Wait for a Subscription

`await channel.subscribe()` waits until the server accepts the subscription.
Concurrent calls wait for the same subscription to become ready. If subscribing
fails or takes longer than 10 seconds, the promise rejects and the channel is
paused. Its handlers remain registered for a later retry.

### Unsubscribe

Pause delivery while retaining event handlers:

```javascript
channel.unsubscribe();

// Resume the same channel.
await channel.subscribe();
```

Messages received while paused are discarded, not buffered or replayed on resume.
After subscribing again, the same handlers receive new messages. Presence resumes
from a fresh snapshot.

Row fetches and presence snapshots started before unsubscribe are discarded when
they finish, even if you have since subscribed again.

`removeChannel()`, `removeAllChannels()`, and `disconnect()` discard subscriptions
and listeners. Auth identity changes discard subscriptions while preserving
application listeners.

### Remove a Channel

```javascript
realtime.removeChannel('my-channel', 'postgres');
```

### Remove All Channels

```javascript
realtime.removeAllChannels();
```

### Check Connection Status

```javascript
if (realtime.isConnected()) {
  console.log('Connected');
} else {
  console.log('Disconnected');
}
```

### Disconnect

```javascript
realtime.disconnect();
```

## Dynamic Token Refresh

For long-lived connections, provide a function to refresh the access token:

```javascript
const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.example.com',
  anonKey: 'anon-key',
  getToken: async () => {
    // Refresh the token through your auth system
    const { session } = await volcano.auth.refreshSession();
    return session.access_token;
  },
});
```

## Integration with VolcanoAuth

For auto-fetching lightweight notifications, pass your VolcanoAuth client:

```javascript
const volcano = new VolcanoAuth({ ... });
volcano.database('your_database_name'); // Required for auto-fetch queries

const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.example.com',
  anonKey: 'anon-key',
  accessToken: volcano.accessToken,
  volcanoClient: volcano, // Enables auto-fetch for lightweight mode
  databaseName: 'your_database_name' // Optional if volcano.database(...) already called
});
```

## TypeScript

The realtime module includes full TypeScript definitions:

```typescript
import {
  VolcanoRealtime,
  RealtimeChannel,
  PostgresChange,
  PresenceState,
  ConnectContext,
  DisconnectContext,
  ErrorContext
} from '@volcano.dev/sdk/realtime';

const realtime = new VolcanoRealtime({ ... });

realtime.onConnect((ctx: ConnectContext) => {
  console.log('Connected:', ctx.client);
});

const channel: RealtimeChannel = realtime.channel('updates', { type: 'postgres' });

channel.onPostgresChanges('INSERT', 'public', 'posts', (change: PostgresChange) => {
  console.log('New post:', change.record);
});
```

## Error Handling

Handle errors at both the connection and channel level:

```javascript
// Connection errors
realtime.onError((ctx) => {
  console.error('Connection error:', ctx.message);
  showConnectionError();
});

// Channel subscription errors
try {
  await channel.subscribe();
} catch (error) {
  console.error('Subscription failed:', error.message);
}
```

## Best Practices

### Clean Up on Unmount

In React or other component-based frameworks:

```javascript
useEffect(() => {
  const realtime = new VolcanoRealtime({ ... });
  realtime.connect();

  const channel = realtime.channel('updates', { type: 'postgres' });
  channel.onPostgresChanges('*', 'public', 'posts', handleChange);
  channel.subscribe();

  // Clean up
  return () => {
    channel.unsubscribe();
    realtime.disconnect();
  };
}, []);
```

### Reconnection Handling

The client reconnects automatically, but you may want to refresh data:

```javascript
realtime.onConnect(() => {
  // Connection restored - refresh data
  fetchLatestPosts();
});
```

### Combine with Initial Fetch

Load initial data, then subscribe for updates:

```javascript
// Fetch initial data
const { data: posts } = await volcano
  .from('posts')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50);

setPosts(posts);

// Subscribe for updates
channel.onPostgresChanges('INSERT', 'public', 'posts', (change) => {
  setPosts((current) => [change.record, ...current]);
});

channel.onPostgresChanges('UPDATE', 'public', 'posts', (change) => {
  setPosts((current) => current.map((p) => (p.id === change.record.id ? change.record : p)));
});

channel.onPostgresChanges('DELETE', 'public', 'posts', (change) => {
  setPosts((current) => current.filter((p) => p.id !== change.old_record.id));
});
```

## Next Steps

- [Database](./database.md) - Query and modify data that triggers realtime events
- [Authentication](./authentication.md) - Get the access token for realtime connections
- [Next.js](./nextjs.md) - Use realtime in Next.js applications
