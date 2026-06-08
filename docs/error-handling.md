# Error Handling

The Volcano SDK uses a consistent error handling pattern across all operations. Rather than throwing exceptions, methods return error objects that you can inspect and handle appropriately.

## The Error Pattern

All SDK methods return an object with an `error` property:

```javascript
const { data, error } = await volcano.from('posts').select('*');

if (error) {
  console.error('Something went wrong:', error.message);
  return;
}

// data is safe to use
console.log(data);
```

This pattern has several advantages:

- **Explicit error handling** - You must acknowledge the error property
- **No try/catch needed** - Errors don't interrupt execution flow
- **Consistent API** - Same pattern for auth, database, storage, and functions
- **Type safety** - TypeScript knows the data type when error is checked

## Authentication Errors

### Sign Up

```javascript
const { user, session, error } = await volcano.auth.signUp({
  email: 'user@example.com',
  password: 'weak',
});

if (error) {
  switch (true) {
    case error.message.includes('already exists'):
      showError('An account with this email already exists. Try signing in.');
      break;
    case error.message.includes('weak password'):
      showError('Please choose a stronger password with at least 8 characters.');
      break;
    case error.message.includes('invalid email'):
      showError('Please enter a valid email address.');
      break;
    default:
      showError('Sign up failed. Please try again.');
      console.error('Sign up error:', error);
  }
  return;
}

// Success
console.log('Welcome!', user.email);
```

### Sign In

```javascript
const { user, session, error } = await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
});

if (error) {
  switch (true) {
    case error.message.includes('Invalid credentials'):
      showError('Incorrect email or password.');
      break;
    case error.message.includes('email not confirmed'):
      showError('Please confirm your email before signing in.');
      break;
    case error.message.includes('too many attempts'):
      showError('Too many failed attempts. Please try again later.');
      break;
    default:
      showError('Sign in failed. Please try again.');
      console.error('Sign in error:', error);
  }
  return;
}
```

### Session Errors

```javascript
const { user, error } = await volcano.auth.getUser();

if (error) {
  if (error.message.includes('No active session')) {
    // User is not logged in
    redirectToLogin();
    return;
  }

  if (error.message.includes('Session expired')) {
    // Session needs refresh (SDK usually handles this automatically)
    const { session, error: refreshError } = await volcano.auth.refreshSession();
    if (refreshError) {
      redirectToLogin();
      return;
    }
    // Retry the original request
  }
}
```

## Database Errors

### Query Errors

```javascript
const { data, error } = await volcano.from('posts').select('*').eq('status', 'published');

if (error) {
  switch (true) {
    case error.message.includes('No active session'):
      showError('Please sign in to view posts.');
      break;
    case error.message.includes('Database name not set'):
      console.error('Developer error: Call volcano.database() first');
      break;
    case error.message.includes('column') && error.message.includes('does not exist'):
      console.error('Developer error: Invalid column name in query');
      break;
    case error.message.includes('permission denied'):
      showError("You don't have permission to view this data.");
      break;
    case error.message.includes('timeout'):
      showError('Request timed out. Please try again.');
      break;
    default:
      showError('Failed to load data.');
      console.error('Query error:', error);
  }
  return;
}
```

### Insert Errors

```javascript
const { data, error } = await volcano.insert('posts', {
  title: 'My Post',
  content: 'Content here',
});

if (error) {
  switch (true) {
    case error.message.includes('violates unique constraint'):
      showError('A post with this title already exists.');
      break;
    case error.message.includes('violates foreign key'):
      showError('Invalid reference. Please check your data.');
      break;
    case error.message.includes('violates check constraint'):
      showError('Invalid data. Please check your input.');
      break;
    case error.message.includes('permission denied'):
      showError("You don't have permission to create posts.");
      break;
    default:
      showError('Failed to create post.');
      console.error('Insert error:', error);
  }
  return;
}
```

### Update/Delete Errors

```javascript
const { data, error } = await volcano.update('posts', { status: 'published' }).eq('id', postId);

if (error) {
  if (error.message.includes('permission denied')) {
    showError('You can only edit your own posts.');
    return;
  }
  showError('Failed to update post.');
  return;
}

// Check if any rows were updated
if (!data || data.length === 0) {
  showError('Post not found or already deleted.');
  return;
}
```

## Storage Errors

```javascript
const { data, error } = await volcano.storage.from('uploads').upload('documents/report.pdf', file);

if (error) {
  switch (true) {
    case error.message.includes('No active session'):
      showError('Please sign in to upload files.');
      break;
    case error.message.includes('Bucket not found'):
      console.error('Developer error: Invalid bucket name');
      break;
    case error.message.includes('File too large'):
      showError('File is too large. Maximum size is 100MB.');
      break;
    case error.message.includes('permission denied'):
      showError("You don't have permission to upload to this location.");
      break;
    case error.message.includes('invalid file type'):
      showError('This file type is not allowed.');
      break;
    default:
      showError('Upload failed. Please try again.');
      console.error('Upload error:', error);
  }
  return;
}
```

### Download Errors

```javascript
const { data: blob, error } = await volcano.storage
  .from('uploads')
  .download('documents/report.pdf');

if (error) {
  switch (true) {
    case error.message.includes('File not found'):
    case error.message.includes('404'):
      showError('File not found. It may have been deleted.');
      break;
    case error.message.includes('permission denied'):
      showError("You don't have permission to download this file.");
      break;
    default:
      showError('Download failed. Please try again.');
  }
  return;
}
```

## Function Errors

```javascript
const { data, error } = await volcano.functions.invoke('process-payment', {
  amount: 1999,
  currency: 'usd',
});

if (error) {
  switch (true) {
    case error.message.includes('No active session'):
      showError('Please sign in to continue.');
      break;
    case error.message.includes('Function not found'):
      console.error('Developer error: Invalid function name');
      break;
    case error.message.includes('timeout'):
      showError('Request timed out. Please try again.');
      break;
    case error.message.includes('rate limit'):
      showError('Too many requests. Please wait a moment.');
      break;
    default:
      showError('Operation failed. Please try again.');
      console.error('Function error:', error);
  }
  return;
}

// Function may return its own error in the data
if (data && data.error) {
  showError(data.error);
  return;
}
```

## Realtime Errors

### Connection Errors

```javascript
const realtime = new VolcanoRealtime({ ... });

realtime.onError((ctx) => {
  console.error('Connection error:', ctx.message);

  if (ctx.message?.includes('authentication')) {
    // Token may have expired
    refreshTokenAndReconnect();
  } else if (ctx.message?.includes('network')) {
    showError('Connection lost. Reconnecting...');
  }
});

realtime.onDisconnect((ctx) => {
  if (!ctx.reconnect) {
    // Won't auto-reconnect, handle manually
    showError('Connection closed.');
  }
});
```

### Subscription Errors

```javascript
const channel = realtime.channel('posts', { type: 'postgres' });

try {
  await channel.subscribe();
} catch (error) {
  console.error('Subscription failed:', error.message);
  showError('Failed to subscribe to updates.');
}
```

## Creating Custom Error Handlers

### Centralized Error Handler

```javascript
// lib/errorHandler.js
export function handleApiError(error, context = 'Operation') {
  // Log for debugging
  console.error(`${context} error:`, error);

  // Common errors
  if (error.message.includes('No active session')) {
    return {
      message: 'Please sign in to continue.',
      action: 'redirect_login',
    };
  }

  if (error.message.includes('permission denied')) {
    return {
      message: "You don't have permission to perform this action.",
      action: 'show_error',
    };
  }

  if (error.message.includes('timeout')) {
    return {
      message: 'Request timed out. Please try again.',
      action: 'retry',
    };
  }

  if (error.message.includes('rate limit')) {
    return {
      message: 'Too many requests. Please wait a moment.',
      action: 'wait',
    };
  }

  // Default
  return {
    message: `${context} failed. Please try again.`,
    action: 'show_error',
  };
}

// Usage
const { data, error } = await volcano.from('posts').select('*');

if (error) {
  const { message, action } = handleApiError(error, 'Loading posts');

  switch (action) {
    case 'redirect_login':
      router.push('/login');
      break;
    case 'retry':
      // Implement retry logic
      break;
    default:
      showToast(message, 'error');
  }
  return;
}
```

### React Error Hook

```typescript
// hooks/useApiCall.ts
import { useState, useCallback } from 'react';

interface ApiCallState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useApiCall<T>() {
  const [state, setState] = useState<ApiCallState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(async (
    apiCall: () => Promise<{ data: T | null; error: Error | null }>
  ) => {
    setState({ data: null, error: null, loading: true });

    try {
      const result = await apiCall();

      if (result.error) {
        setState({ data: null, error: result.error, loading: false });
        return { data: null, error: result.error };
      }

      setState({ data: result.data, error: null, loading: false });
      return { data: result.data, error: null };
    } catch (e) {
      const error = e instanceof Error ? e : new Error('Unknown error');
      setState({ data: null, error, loading: false });
      return { data: null, error };
    }
  }, []);

  return { ...state, execute };
}

// Usage
function PostList() {
  const { data: posts, error, loading, execute } = useApiCall<Post[]>();

  useEffect(() => {
    execute(() =>
      volcano
        .from<Post>('posts')
        .select('*')
        .order('created_at', { ascending: false })
    );
  }, [execute]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!posts) return <Empty />;

  return <PostGrid posts={posts} />;
}
```

## Retry Strategies

### Simple Retry

```javascript
async function fetchWithRetry(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, error } = await fn();

    if (!error) {
      return { data, error: null };
    }

    lastError = error;

    // Don't retry certain errors
    if (
      error.message.includes('permission denied') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
    ) {
      return { data: null, error };
    }

    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  return { data: null, error: lastError };
}

// Usage
const { data, error } = await fetchWithRetry(() => volcano.from('posts').select('*'));
```

### Retry with Toast Notification

```javascript
async function fetchWithProgress(fn, options = {}) {
  const { maxRetries = 3, context = 'Loading' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, error } = await fn();

    if (!error) {
      return { data, error: null };
    }

    if (attempt < maxRetries && error.message.includes('timeout')) {
      showToast(`${context} is taking longer than expected. Retrying...`, 'info');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }

    return { data: null, error };
  }
}
```

## Best Practices

### 1. Always Check Errors

```javascript
// Good
const { data, error } = await volcano.from('posts').select('*');
if (error) {
  handleError(error);
  return;
}
// Use data safely

// Avoid
const { data } = await volcano.from('posts').select('*');
// data could be null if there was an error
```

### 2. Provide Meaningful Messages

```javascript
// Good
if (error.message.includes('permission denied')) {
  showError('You can only view your own posts.');
}

// Avoid
if (error) {
  showError(error.message); // May expose technical details
}
```

### 3. Log for Debugging

```javascript
if (error) {
  // Log the full error for debugging
  console.error('Failed to load posts:', error);

  // Show a user-friendly message
  showError('Unable to load posts. Please try again.');
}
```

### 4. Handle Network Issues

```javascript
const { data, error } = await volcano.from('posts').select('*');

if (error) {
  if (!navigator.onLine) {
    showError('You appear to be offline. Please check your connection.');
  } else if (error.message.includes('timeout')) {
    showError('Connection is slow. Please try again.');
  } else {
    showError('Something went wrong. Please try again.');
  }
}
```

### 5. Clean Up on Error

```javascript
setLoading(true);
setError(null);

const { data, error } = await volcano.from('posts').select('*');

setLoading(false);

if (error) {
  setError(error.message);
  setData(null); // Clear stale data
  return;
}

setData(data);
```

## Next Steps

- [Authentication](./authentication.md) - Auth-specific error handling
- [Database](./database.md) - Query error patterns
- [TypeScript](./typescript.md) - Type-safe error handling
