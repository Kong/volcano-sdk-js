# Database

Volcano lets you query your PostgreSQL database directly from the browser using a fluent query builder. Combined with Row-Level Security (RLS), this provides a secure and powerful way to build data-driven applications without writing backend code.

## Overview

The database module provides:

- **Query Builder** - Chainable methods for building SELECT, INSERT, UPDATE, and DELETE queries
- **Row-Level Security** - Automatic filtering based on the authenticated user
- **Type Safety** - Full TypeScript support for query results
- **Error Handling** - Consistent error responses across all operations

## Setup

Before querying, set your database name:

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

const volcano = new VolcanoAuth({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
});

// Set database name (do this once after initialization)
volcano.database('my-database');

// Sign in (required for most operations)
await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
});
```

The database name is typically the name you gave your database when creating it in the Volcano dashboard.

## Querying Data (SELECT)

### Basic Select

Fetch all rows from a table:

```javascript
const { data, error, count } = await volcano.from('posts').select('*');

if (error) {
  console.error('Query failed:', error.message);
  return;
}

console.log(`Found ${count} posts`);
data.forEach((post) => {
  console.log(`- ${post.title}`);
});
```

### Select Specific Columns

Request only the columns you need:

```javascript
const { data } = await volcano.from('posts').select('id, title, created_at');

// Each item only contains id, title, and created_at
```

This reduces data transfer and improves performance, especially for tables with many columns.

### Filtering

The query builder supports a variety of filter operators:

#### Equality

```javascript
// Posts where status equals 'published'
const { data } = await volcano.from('posts').select('*').eq('status', 'published');
```

#### Not Equal

```javascript
// Posts where status is not 'draft'
const { data } = await volcano.from('posts').select('*').neq('status', 'draft');
```

#### Comparison Operators

```javascript
// Posts with more than 100 views
const { data } = await volcano.from('posts').select('*').gt('views', 100);

// Posts with at least 100 views
const { data } = await volcano.from('posts').select('*').gte('views', 100);

// Posts with fewer than 50 views
const { data } = await volcano.from('posts').select('*').lt('views', 50);

// Posts with 50 or fewer views
const { data } = await volcano.from('posts').select('*').lte('views', 50);
```

#### Pattern Matching

```javascript
// Case-sensitive pattern matching
const { data } = await volcano.from('posts').select('*').like('title', 'Getting Started%'); // Starts with "Getting Started"

// Case-insensitive pattern matching
const { data } = await volcano.from('posts').select('*').ilike('title', '%javascript%'); // Contains "javascript" (any case)
```

Pattern syntax:

- `%` matches any sequence of characters
- `_` matches any single character

#### NULL Checks

```javascript
// Posts without a deleted timestamp
const { data } = await volcano.from('posts').select('*').is('deleted_at', null);
```

#### IN Operator

```javascript
// Posts with specific statuses
const { data } = await volcano
  .from('posts')
  .select('*')
  .in('status', ['draft', 'published', 'archived']);
```

### Combining Filters

Chain multiple filters for AND logic:

```javascript
const { data } = await volcano
  .from('products')
  .select('id, name, price')
  .eq('category', 'electronics')
  .gte('price', 100)
  .lte('price', 500)
  .eq('in_stock', true);

// SQL equivalent:
// WHERE category = 'electronics'
//   AND price >= 100
//   AND price <= 500
//   AND in_stock = true
```

### Ordering Results

Sort results by one or more columns:

```javascript
// Sort by created_at descending (newest first)
const { data } = await volcano.from('posts').select('*').order('created_at', { ascending: false });

// Sort by multiple columns
const { data } = await volcano
  .from('posts')
  .select('*')
  .order('category', { ascending: true })
  .order('created_at', { ascending: false });
```

### Pagination

Limit and offset results for pagination:

```javascript
const pageSize = 10;
const page = 3;

const { data, count } = await volcano
  .from('posts')
  .select('id, title')
  .order('created_at', { ascending: false })
  .limit(pageSize)
  .offset((page - 1) * pageSize); // Skip first 20 rows

console.log(`Showing page ${page} of ${Math.ceil(count / pageSize)}`);
```

### Complete Example

Here's a realistic query combining multiple features:

```javascript
async function getPublishedPosts(category, page = 1) {
  const pageSize = 20;

  const { data, error, count } = await volcano
    .from('posts')
    .select('id, title, excerpt, author_name, created_at')
    .eq('status', 'published')
    .eq('category', category)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (error) {
    throw new Error(`Failed to fetch posts: ${error.message}`);
  }

  return {
    posts: data,
    totalPages: Math.ceil(count / pageSize),
    currentPage: page,
  };
}
```

## Inserting Data

### Single Insert

```javascript
const { data, error } = await volcano.insert('posts', {
  title: 'My New Post',
  content: 'This is the content of my post.',
  status: 'draft',
});

if (error) {
  console.error('Insert failed:', error.message);
  return;
}

const newPost = data[0];
console.log('Created post with ID:', newPost.id);
```

The insert returns the created row(s), including any auto-generated values like `id` or `created_at`.

### Insert with User Context

If your table has a `user_id` column and RLS policies, the user ID is automatically associated:

```javascript
// Assuming posts table has user_id column with default value auth.uid()
const { data } = await volcano.insert('posts', {
  title: 'My Post',
  content: 'Content here',
});

// The returned post includes user_id set to the current user
console.log('Author ID:', data[0].user_id);
```

This works because Volcano injects the authenticated user's context into every database request.

## Updating Data

### Update with Filter

Always use a filter to specify which rows to update:

```javascript
const { data, error } = await volcano
  .update('posts', {
    title: 'Updated Title',
    status: 'published',
    updated_at: new Date().toISOString(),
  })
  .eq('id', postId);

if (error) {
  console.error('Update failed:', error.message);
  return;
}

const updatedPost = data[0];
console.log('Post updated:', updatedPost.title);
```

### Update Multiple Rows

Filter conditions can match multiple rows:

```javascript
// Archive all posts older than 1 year
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const { data, error } = await volcano
  .update('posts', {
    status: 'archived',
  })
  .lt('created_at', oneYearAgo.toISOString())
  .eq('status', 'published');

console.log(`Archived ${data.length} posts`);
```

## Deleting Data

### Delete with Filter

```javascript
const { data, error } = await volcano.delete('posts').eq('id', postId);

if (error) {
  console.error('Delete failed:', error.message);
  return;
}

console.log('Deleted post:', data[0].id);
```

### Soft Delete Pattern

Many applications prefer soft deletes (marking records as deleted rather than removing them):

```javascript
// Soft delete
const { data } = await volcano
  .update('posts', {
    deleted_at: new Date().toISOString(),
  })
  .eq('id', postId);

// Query excludes soft-deleted records
const { data: activePosts } = await volcano.from('posts').select('*').is('deleted_at', null);
```

## Row-Level Security

Row-Level Security (RLS) is PostgreSQL's mechanism for controlling which rows users can access. Volcano automatically passes the authenticated user's context to the database, enabling RLS policies to work seamlessly.

### How It Works

1. When you sign in, the SDK receives an access token containing your user ID
2. Every database query includes this token in the Authorization header
3. Volcano's proxy extracts the user ID and sets it in the database session
4. Your RLS policies use `auth.uid()` to reference the current user

### Example RLS Policy

In your database, create policies like:

```sql
-- Users can only read their own posts
CREATE POLICY "Users can read own posts"
ON posts FOR SELECT
USING (user_id = auth.uid());

-- Users can only update their own posts
CREATE POLICY "Users can update own posts"
ON posts FOR UPDATE
USING (user_id = auth.uid());

-- Users can insert posts as themselves
CREATE POLICY "Users can insert own posts"
ON posts FOR INSERT
WITH CHECK (user_id = auth.uid());
```

### Automatic Filtering

With these policies, queries are automatically filtered:

```javascript
// Alice signs in
await volcano.auth.signIn({ email: 'alice@example.com', password: '...' });

// This returns only Alice's posts
const { data: alicePosts } = await volcano.from('posts').select('*');

// Bob signs in (different session)
await volcano.auth.signIn({ email: 'bob@example.com', password: '...' });

// This returns only Bob's posts
const { data: bobPosts } = await volcano.from('posts').select('*');
```

Same query, different results based on who's authenticated.

### Public Data

For data that should be readable by anyone (even unauthenticated users), create policies with `true`:

```sql
-- Anyone can read published posts
CREATE POLICY "Published posts are public"
ON posts FOR SELECT
USING (status = 'published');
```

## TypeScript Support

The query builder supports TypeScript generics for type-safe results:

```typescript
interface Post {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
}

const { data, error } = await volcano.from<Post>('posts').select('*').eq('status', 'published');

if (data) {
  // data is typed as Post[]
  data.forEach((post) => {
    console.log(post.title); // TypeScript knows this is a string
  });
}
```

## Error Handling

All database operations return an `error` object instead of throwing:

```javascript
const { data, error } = await volcano.from('posts').select('*').eq('invalid_column', 'value');

if (error) {
  // Handle the error
  console.error('Query failed:', error.message);

  // Common error types:
  // - "column does not exist" - Invalid column name
  // - "permission denied" - RLS policy violation
  // - "No active session" - User not authenticated
  // - "Database name not set" - Forgot to call volcano.database()
}
```

## Best Practices

### Always Set Database Name

Call `volcano.database()` before any queries:

```javascript
const volcano = new VolcanoAuth({ ... });
volcano.database('my-database');  // Do this once
```

### Sign In Before Querying

Most applications require authentication:

```javascript
// Check for existing session first
const { user } = await volcano.initialize();

if (!user) {
  // Redirect to login
  return;
}

// Now safe to query
const { data } = await volcano.from('posts').select('*');
```

### Use Specific Columns

Select only the columns you need:

```javascript
// Good - only fetches needed columns
const { data } = await volcano.from('posts').select('id, title, created_at');

// Avoid - fetches all columns including potentially large ones
const { data } = await volcano.from('posts').select('*');
```

### Paginate Large Results

Don't fetch thousands of rows at once:

```javascript
const { data } = await volcano
  .from('posts')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50); // Reasonable page size
```

### Use Filters to Limit Data

Let RLS and filters reduce the data server-side:

```javascript
// Good - filters on server
const { data } = await volcano
  .from('posts')
  .select('*')
  .eq('status', 'published')
  .eq('category', category);

// Avoid - fetches everything then filters client-side
const { data } = await volcano.from('posts').select('*');
const filtered = data.filter((p) => p.status === 'published');
```

## Lambda Functions

For complex queries that aren't possible with the query builder (JOINs, CTEs, stored procedures), use Lambda functions with the standard `pg` library:

```javascript
// Call a Lambda function for complex queries
const { data, error } = await volcano.functions.invoke('get-dashboard-stats', {
  timeframe: 'last-30-days',
});
```

See the [Functions guide](./functions.md) for more details on Lambda functions.

## Next Steps

- [Storage](./storage.md) - Upload and manage files
- [Realtime](./realtime.md) - Subscribe to database changes
- [Functions](./functions.md) - Complex queries with Lambda functions
