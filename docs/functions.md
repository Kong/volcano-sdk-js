# Functions

Volcano Functions are serverless functions that run your custom backend logic. They're perfect for operations that can't be done from the browser, like complex database queries, third-party API integrations, or secure operations.

## Overview

Functions provide:

- **Secure Execution** - Code runs server-side, away from client inspection
- **Full SQL Access** - Write complex queries with JOINs, CTEs, and more
- **Third-Party APIs** - Call external services with secrets kept secure
- **Background Jobs** - Process data, send emails, generate reports
- **User Context** - Functions receive the authenticated user's identity

## Invoking Functions

### Basic Invocation

```javascript
const { data, status, version, error } = await volcano.functions.invoke('send-welcome-email', {
  template: 'welcome',
  recipientId: user.id,
});

if (error) {
  console.error('Function failed:', error.message);
  return;
}

console.log('Status:', status);
console.log('Version:', version);
console.log('Result:', data);
```

`version` maps to the `X-Volcano-Version` response header (`<version>` in production, `<env>-<version>` in non-production).

### With Typed Response

```typescript
interface DashboardStats {
  totalUsers: number;
  activeToday: number;
  revenue: number;
}

const { data, status, headers, version, error } = await volcano.functions.invoke<
  { timeframe: string },
  DashboardStats
>('get-dashboard-stats', {
  timeframe: 'last-30-days',
});

if (data) {
  console.log('HTTP status:', status);
  console.log('X-Volcano-Version:', version);
  console.log('Total users:', data.totalUsers);
  console.log('Active today:', data.activeToday);
}
```

### No Payload

```javascript
const { data, status, headers, version, error } = await volcano.functions.invoke('health-check');
```

## Authentication

Functions automatically receive the authenticated user's context. The user's access token is passed to the function, which can:

1. Verify the user's identity
2. Query the database with Row-Level Security
3. Access user-specific data

```javascript
// Client-side
await volcano.auth.signIn({ email: 'alice@example.com', password: '...' });

// Function is called with Alice's identity
const { data } = await volcano.functions.invoke('get-my-profile');
// Returns Alice's profile data
```

## Writing Functions

Functions are deployed through the Volcano dashboard or CLI. Here's what they look like:

### Basic Function

```javascript
// functions/hello.js
exports.handler = async (event) => {
  const name = event.name || 'World';

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Hello, ${name}!`,
    }),
  };
};
```

### With Authentication

```javascript
// functions/get-my-posts.js
const { Client } = require('pg');

exports.handler = async (event) => {
  // User context is injected by Volcano
  const auth = event.__volcano_auth;

  if (!auth) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Connect to database with user context. DATABASE_URL already carries the
  // unique username the proxy routes by; databaseConnectionString only sets
  // application_name to impersonate the auth user so Row-Level Security applies.
  const { databaseConnectionString } = require('@volcano.dev/sdk');
  const connStr = databaseConnectionString(process.env.DATABASE_URL, { userId: auth.user_id });

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // RLS automatically filters to this user's posts
    const { rows } = await client.query('SELECT * FROM posts ORDER BY created_at DESC');

    return {
      statusCode: 200,
      body: JSON.stringify({ posts: rows }),
    };
  } finally {
    await client.end();
  }
};
```

### Complex Database Query

```javascript
// functions/dashboard-stats.js
const { Client } = require('pg');

exports.handler = async (event) => {
  const auth = event.__volcano_auth;
  if (!auth) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { timeframe } = event;
  const days = timeframe === 'last-7-days' ? 7 : 30;

  const { databaseConnectionString } = require('@volcano.dev/sdk');
  const connStr = databaseConnectionString(process.env.DATABASE_URL, { userId: auth.user_id });

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // Complex query with CTE and aggregations
    const result = await client.query(`
      WITH recent_posts AS (
        SELECT * FROM posts
        WHERE created_at > NOW() - INTERVAL '${days} days'
      ),
      stats AS (
        SELECT
          COUNT(*) as total_posts,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published
        FROM recent_posts
      )
      SELECT * FROM stats
    `);

    return {
      statusCode: 200,
      body: JSON.stringify(result.rows[0]),
    };
  } finally {
    await client.end();
  }
};
```

### Calling External APIs

```javascript
// functions/send-slack-notification.js
exports.handler = async (event) => {
  const auth = event.__volcano_auth;
  if (!auth) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { channel, message } = event;

  // Webhook URL stored as environment variable
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      text: message,
      username: 'Volcano Bot',
    }),
  });

  if (!response.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send notification' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
```

## Use Cases

### When to Use Functions

Functions are ideal for:

| Use Case              | Example                              |
| --------------------- | ------------------------------------ |
| **Complex Queries**   | JOINs, CTEs, window functions        |
| **Aggregations**      | Dashboard statistics, reports        |
| **Stored Procedures** | Business logic in PostgreSQL         |
| **External APIs**     | Stripe payments, SendGrid emails     |
| **File Processing**   | Image resizing, PDF generation       |
| **Scheduled Tasks**   | Daily reports, cleanup jobs          |
| **Admin Operations**  | Bulk updates, data migrations        |
| **Secure Operations** | Secret key usage, privileged actions |

### When to Use Query Builder

The browser-based query builder is better for:

- Simple CRUD operations
- Single-table queries with filters
- Real-time updates (less latency)
- Reducing backend code

## Error Handling

### Client-Side

```javascript
const { data, error } = await volcano.functions.invoke('process-payment', {
  amount: 1999,
  currency: 'usd',
});

if (error) {
  // Network error or function threw
  console.error('Function error:', error.message);
  showErrorToast('Payment failed. Please try again.');
  return;
}

// Check for business logic errors in the response
if (data.error) {
  console.error('Payment error:', data.error);
  showErrorToast(data.error);
  return;
}

console.log('Payment successful:', data.paymentId);
```

### Function-Side

```javascript
exports.handler = async (event) => {
  try {
    // Function logic
    const result = await processPayment(event);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, paymentId: result.id }),
    };
  } catch (error) {
    console.error('Payment error:', error);

    // Return structured error
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: error.message,
        code: error.code || 'PAYMENT_FAILED',
      }),
    };
  }
};
```

## Environment Variables

Functions can access environment variables configured in the Volcano dashboard:

```javascript
exports.handler = async (event) => {
  // Built-in variables. DATABASE_URL already carries the unique username the
  // proxy routes by; pass it to databaseConnectionString rather than building
  // application_name yourself.
  const dbUrl = process.env.DATABASE_URL;

  // Custom variables (set in dashboard)
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  // Use them
  const stripe = require('stripe')(stripeKey);
  // ...
};
```

Store sensitive data like API keys as environment variables rather than in code.

## Database Access Patterns

### User Context (RLS Enforced)

For queries that should respect Row-Level Security:

```javascript
const { databaseConnectionString } = require('@volcano.dev/sdk');

const auth = event.__volcano_auth;
// Impersonates the auth user: application_name=volcano_user_access:{userId}
const connStr = databaseConnectionString(process.env.DATABASE_URL, { userId: auth.user_id });

const client = new Client({ connectionString: connStr });
// Queries filtered by RLS
```

### Admin Access (Bypass RLS)

For administrative operations:

```javascript
const { databaseConnectionString } = require('@volcano.dev/sdk');

// No userId: application_name=volcano_full_access
const connStr = databaseConnectionString(process.env.DATABASE_URL);

const client = new Client({ connectionString: connStr });
// Full access to all data
```

The proxy routes by the globally-unique username (`volcano_client_{id}`) that is
already in `DATABASE_URL`; `application_name` only selects the access mode. Prefer
`databaseConnectionString` over hand-building `application_name`.

### Connection Pooling

The access mode and RLS identity are selected by `application_name` at
connection startup, so they cannot be changed on a pooled connection after it is
established. Pool connections that all share one access mode (e.g. a per-user
function whose pool connection string already targets that user, or admin work),
and open a fresh connection when the identity differs.

```javascript
const { Pool } = require('pg');
const { databaseConnectionString } = require('@volcano.dev/sdk');

// Admin pool created outside the handler (reused across invocations). Its
// application_name is fixed to full_access at startup.
const adminPool = new Pool({
  connectionString: databaseConnectionString(process.env.DATABASE_URL),
  max: 20,
});

exports.handler = async (event) => {
  const auth = event.__volcano_auth;

  // Per-user RLS query: the connection must start up as this user, so use a
  // short-lived client with the user-access connection string.
  const { Client } = require('pg');
  const client = new Client({
    connectionString: databaseConnectionString(process.env.DATABASE_URL, { userId: auth.user_id }),
  });
  await client.connect();

  try {
    const { rows } = await client.query('SELECT * FROM posts'); // filtered by RLS
    return {
      statusCode: 200,
      body: JSON.stringify({ posts: rows }),
    };
  } finally {
    await client.end();
  }
};
```

## Best Practices

### Validate Input

Always validate function input:

```javascript
exports.handler = async (event) => {
  const { email, amount } = event;

  if (!email || typeof email !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid email' }),
    };
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid amount' }),
    };
  }

  // Proceed with validated input
};
```

### Check Authentication

Most functions should require authentication:

```javascript
exports.handler = async (event) => {
  const auth = event.__volcano_auth;

  if (!auth) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }

  // auth.user_id - The authenticated user's ID
  // auth.email - The user's email
  // auth.role - The user's role (if set)
};
```

### Handle Timeouts

Functions have execution time limits. Handle long operations gracefully:

```javascript
exports.handler = async (event) => {
  // Set a timeout shorter than the function limit
  const timeout = setTimeout(() => {
    console.error('Operation taking too long');
  }, 25000);

  try {
    const result = await longRunningOperation();
    return { statusCode: 200, body: JSON.stringify(result) };
  } finally {
    clearTimeout(timeout);
  }
};
```

### Log for Debugging

Use `console.log` for debugging - logs appear in the Volcano dashboard:

```javascript
exports.handler = async (event) => {
  console.log('Function invoked with:', JSON.stringify(event));
  console.log('User:', event.__volcano_auth?.user_id);

  try {
    const result = await processData(event);
    console.log('Result:', result);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

## Next Steps

- [Database](./database.md) - Use the query builder for simple operations
- [Authentication](./authentication.md) - Understand user context in functions
- [Storage](./storage.md) - Process uploaded files in functions
