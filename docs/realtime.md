# Realtime

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

Subscribe to database changes and get notified in real-time when data is modified.

### Setup

```javascript
const channel = realtime.channel('my-changes', { type: 'postgres' });
```

### Listen for All Changes

```javascript
channel.onPostgresChanges('*', 'public', 'posts', (change) => {
  console.log('Change type:', change.type); // INSERT, UPDATE, or DELETE
  console.log('Table:', change.table);
  console.log('Schema:', change.schema);
  console.log('Timestamp:', change.timestamp);

  if (change.type === 'INSERT') {
    console.log('New record:', change.record);
  }

  if (change.type === 'UPDATE') {
    console.log('Updated record:', change.record);
    console.log('Previous record:', change.old_record);
    console.log('Changed columns:', change.columns);
  }

  if (change.type === 'DELETE') {
    console.log('Deleted record:', change.old_record);
  }
});

await channel.subscribe();
```

### Filter by Event Type

Listen only for specific operations:

```javascript
// Only INSERTs
channel.onPostgresChanges('INSERT', 'public', 'messages', (change) => {
  console.log('New message:', change.record);
  addMessageToUI(change.record);
});

// Only UPDATEs
channel.onPostgresChanges('UPDATE', 'public', 'posts', (change) => {
  console.log('Post updated:', change.record.id);
  updatePostInUI(change.record);
});

// Only DELETEs
channel.onPostgresChanges('DELETE', 'public', 'posts', (change) => {
  console.log('Post deleted:', change.old_record.id);
  removePostFromUI(change.old_record.id);
});
```

### Multiple Tables

Subscribe to changes on different tables:

```javascript
const channel = realtime.channel('app-changes', { type: 'postgres' });

channel.onPostgresChanges('*', 'public', 'posts', handlePostChange);
channel.onPostgresChanges('*', 'public', 'comments', handleCommentChange);
channel.onPostgresChanges('*', 'public', 'reactions', handleReactionChange);

await channel.subscribe();
```

### Row-Level Security

Postgres changes respect RLS. Users only receive notifications for rows they can see:

```javascript
// If RLS policy is: user_id = auth.uid()
// Alice will only receive changes for her posts
// Bob will only receive changes for his posts

// Same channel subscription:
channel.onPostgresChanges('*', 'public', 'posts', (change) => {
  // Each user only sees their own data
  console.log('My post changed:', change.record.title);
});
```

### Example: Live Chat

```javascript
const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.example.com',
  anonKey: 'anon-key',
  accessToken: volcano.accessToken,
});

await realtime.connect();

const channel = realtime.channel('chat', { type: 'postgres' });

channel.onPostgresChanges('INSERT', 'public', 'messages', (change) => {
  const message = change.record;
  displayMessage({
    id: message.id,
    text: message.content,
    author: message.author_name,
    time: message.created_at,
  });
});

await channel.subscribe();

// Send a message (through normal database insert)
await volcano.insert('messages', {
  content: 'Hello everyone!',
  channel_id: 'general',
});
// All subscribers receive the INSERT notification
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
  type: 'notification',
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
    type: 'typing',
    user_id: currentUser.id,
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    channel.send({
      type: 'stopped_typing',
      user_id: currentUser.id,
    });
  }, 2000);
}
```

## Presence

Track which users are online and their current state.

### Setup

```javascript
const channel = realtime.channel('lobby', { type: 'presence' });
```

### Track Your Presence

```javascript
await channel.subscribe();

// Announce your presence
await channel.track({
  user_id: currentUser.id,
  username: currentUser.name,
  status: 'online',
  avatar: currentUser.avatar_url,
});
```

### Listen for Presence Updates

```javascript
channel.onPresenceSync((state) => {
  // state is an object: { clientId: userData, ... }
  const onlineUsers = Object.entries(state).map(([clientId, data]) => ({
    clientId,
    ...data,
  }));

  console.log('Online users:', onlineUsers.length);
  updateOnlineUsersList(onlineUsers);
});

await channel.subscribe();
```

### Get Current State

```javascript
// Get presence state at any time
const state = channel.getPresenceState();

for (const [clientId, userData] of Object.entries(state)) {
  console.log(`${userData.username} is ${userData.status}`);
}
```

### Update Your State

```javascript
// Update your presence (e.g., change status)
await channel.track({
  user_id: currentUser.id,
  username: currentUser.name,
  status: 'away',
  last_seen: new Date().toISOString(),
});
```

### Example: Online Users

```javascript
const realtime = new VolcanoRealtime({ ... });
await realtime.connect();

const channel = realtime.channel('app-presence', { type: 'presence' });

channel.onPresenceSync((state) => {
  const users = Object.values(state);

  document.getElementById('online-count').textContent = users.length;

  const list = document.getElementById('online-users');
  list.innerHTML = users
    .map(u => `<li>${u.username} (${u.status})</li>`)
    .join('');
});

await channel.subscribe();

// Track this user
await channel.track({
  user_id: user.id,
  username: user.name,
  status: 'online'
});

// Update status on visibility change
document.addEventListener('visibilitychange', () => {
  const status = document.hidden ? 'away' : 'online';
  channel.track({
    user_id: user.id,
    username: user.name,
    status
  });
});
```

## Managing Channels

### Unsubscribe

Stop receiving events from a channel:

```javascript
channel.unsubscribe();
```

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

### Throttle Presence Updates

Don't update presence too frequently:

```javascript
import { throttle } from 'lodash';

const updatePresence = throttle((state) => {
  channel.track(state);
}, 1000); // At most once per second

window.addEventListener('mousemove', (e) => {
  updatePresence({
    user_id: user.id,
    cursor: { x: e.clientX, y: e.clientY },
  });
});
```

## Next Steps

- [Database](./database.md) - Query and modify data that triggers realtime events
- [Authentication](./authentication.md) - Get the access token for realtime connections
- [Next.js](./nextjs.md) - Use realtime in Next.js applications
