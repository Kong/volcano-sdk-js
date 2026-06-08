# Authentication

Volcano provides a complete authentication system with multiple sign-in methods, session management, and security features. This guide covers everything you need to implement user authentication in your application.

## Overview

The SDK supports several authentication methods:

- **Email/Password** - Traditional sign-up and sign-in with email verification
- **OAuth/SSO** - Sign in with Google, GitHub, Microsoft, or Apple
- **Anonymous Users** - Let users explore your app before creating an account
- **Magic Links** - Passwordless authentication via email (coming soon)

All authentication methods work with the same session system and integrate seamlessly with Row-Level Security.

## Email/Password Authentication

### Sign Up

Create a new user account with email and password:

```javascript
const { user, session, error } = await volcano.auth.signUp({
  email: 'alice@example.com',
  password: 'secure-password-123',
  metadata: {
    full_name: 'Alice Smith',
    avatar_url: 'https://example.com/alice.jpg',
  },
});

if (error) {
  // Handle specific error cases
  if (error.message.includes('already exists')) {
    console.error('An account with this email already exists');
  } else if (error.message.includes('weak password')) {
    console.error('Please choose a stronger password');
  } else {
    console.error('Sign up failed:', error.message);
  }
  return;
}

console.log('Welcome,', user.email);
console.log('User ID:', user.id);
```

The `metadata` field is optional and lets you store additional user information like display names, profile pictures, or preferences. This data is stored securely and accessible via `user.user_metadata`.

### Sign In

Authenticate an existing user:

```javascript
const { user, session, error } = await volcano.auth.signIn({
  email: 'alice@example.com',
  password: 'secure-password-123',
});

if (error) {
  if (error.message.includes('Invalid credentials')) {
    console.error('Incorrect email or password');
  } else {
    console.error('Sign in failed:', error.message);
  }
  return;
}

console.log('Signed in as', user.email);
```

After successful sign-in, the SDK automatically:

1. Stores the access token and refresh token in localStorage (browser) or memory (server)
2. Sets up automatic token refresh before expiration
3. Makes the user available via `volcano.auth.user()`

### Sign Out

End the current session:

```javascript
const { error } = await volcano.auth.signOut();

if (!error) {
  console.log('Signed out successfully');
}
```

This invalidates the refresh token on the server and clears local storage.

## Session Management

### Check Current User

Get the current user synchronously (returns cached data):

```javascript
const user = volcano.auth.user();

if (user) {
  console.log('Logged in as:', user.email);
  console.log('User ID:', user.id);
  console.log('Custom data:', user.user_metadata);
} else {
  console.log('Not logged in');
}
```

### Fetch Fresh User Data

Get the latest user data from the server:

```javascript
const { user, error } = await volcano.auth.getUser();

if (user) {
  console.log('User data refreshed');
  console.log('Email:', user.email);
  console.log('Created:', user.created_at);
}
```

This is useful when you need to ensure the user data is current, such as after updating their profile elsewhere.

### Restore Session on Page Load

When your application starts, restore any existing session:

```javascript
// In your app initialization
const { user, error } = await volcano.initialize();

if (user) {
  console.log('Session restored for', user.email);
  // User is authenticated, show dashboard
} else {
  // No session, show login page
}
```

### Listen for Auth State Changes

React to authentication events in real-time:

```javascript
const unsubscribe = volcano.auth.onAuthStateChange((user) => {
  if (user) {
    // User signed in or session restored
    updateUI({ isLoggedIn: true, user });
  } else {
    // User signed out
    updateUI({ isLoggedIn: false, user: null });
  }
});

// Clean up when your component unmounts
// unsubscribe();
```

This callback fires immediately with the current state, then again whenever the auth state changes.

### Manual Token Refresh

Tokens are refreshed automatically, but you can trigger a manual refresh:

```javascript
const { session, error } = await volcano.auth.refreshSession();

if (session) {
  console.log('Token refreshed, expires in', session.expires_in, 'seconds');
}
```

## OAuth/SSO Authentication

Sign users in with their existing accounts from popular providers.

### Available Providers

- `google` - Google accounts
- `github` - GitHub accounts
- `microsoft` - Microsoft/Azure AD accounts
- `apple` - Apple ID

### Sign In with OAuth

Each provider has a convenience method:

```javascript
// Sign in with Google
volcano.auth.signInWithGoogle();

// Sign in with GitHub
volcano.auth.signInWithGitHub();

// Sign in with Microsoft
volcano.auth.signInWithMicrosoft();

// Sign in with Apple
volcano.auth.signInWithApple();

// Or use the generic method with any provider
volcano.auth.signInWithOAuth('google');
```

These methods redirect the user to the provider's login page. After successful authentication, they're redirected back to your application with an active session.

**Note:** OAuth sign-in only works in browser environments. Calling these methods on the server will throw an error. See the [Next.js guide](./nextjs.md) for server-side OAuth handling.

### Handle OAuth Callback

After the OAuth redirect, the user returns to your app with tokens in the URL. The SDK handles this automatically when you call `initialize()`:

```javascript
// On your callback page or app initialization
const { user, error } = await volcano.initialize();

if (user) {
  console.log('OAuth sign-in successful:', user.email);
}
```

### Link OAuth Provider to Existing Account

Let users add OAuth sign-in to an existing email/password account:

```javascript
// User must be signed in first
const { data, error } = await volcano.auth.linkOAuthProvider('google');

if (error) {
  console.error('Failed to link provider:', error.message);
  return;
}

// Redirect user to complete linking
window.location.href = data.authorization_url;
```

### Unlink OAuth Provider

Remove an OAuth provider from an account:

```javascript
const { error } = await volcano.auth.unlinkOAuthProvider('google');

if (!error) {
  console.log('Google account unlinked');
}
```

### List Linked Providers

See which OAuth providers are connected to the current account:

```javascript
const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

if (providers) {
  providers.forEach((p) => {
    console.log(`${p.provider} linked on ${p.linked_at}`);
  });
}
```

### Access Provider APIs

After OAuth sign-in, you can make authenticated requests to the provider's API:

```javascript
// Get the user's GitHub repositories
const { data, error } = await volcano.auth.callOAuthAPI('github', {
  endpoint: '/user/repos',
  method: 'GET',
});

if (data) {
  data.forEach((repo) => {
    console.log(repo.full_name);
  });
}
```

Volcano automatically handles token refresh and passes the correct credentials to the provider.

## Anonymous Users

Let users explore your app without creating an account, then convert them to full users later.

### Create Anonymous User

```javascript
const { user, session, error } = await volcano.auth.signUpAnonymous({
  preferred_theme: 'dark',
});

if (user) {
  console.log('Anonymous user created:', user.id);
  // User can now use the app with limited features
}
```

Anonymous users get a unique ID and can store data, but they don't have an email address or password.

### Convert to Full Account

When an anonymous user is ready to create a real account:

```javascript
const { user, error } = await volcano.auth.convertAnonymous({
  email: 'alice@example.com',
  password: 'secure-password-123',
  metadata: {
    full_name: 'Alice Smith',
  },
});

if (user) {
  console.log('Account converted! Welcome,', user.email);
  // All their data is preserved with the same user ID
}
```

The conversion preserves the user's ID and all associated data.

## Email Verification

If your project requires email verification, users receive a confirmation email after signing up.

### Confirm Email

When the user clicks the confirmation link, extract the token and confirm:

```javascript
// Token comes from the URL query parameter
const token = new URLSearchParams(window.location.search).get('token');

const { message, error } = await volcano.auth.confirmEmail(token);

if (error) {
  console.error('Confirmation failed:', error.message);
} else {
  console.log('Email confirmed!');
}
```

### Resend Confirmation Email

If the user didn't receive the email:

```javascript
const { message, error } = await volcano.auth.resendConfirmation('alice@example.com');

if (!error) {
  console.log('Confirmation email sent');
}
```

## Password Recovery

### Request Password Reset

Send a password reset email to the user:

```javascript
const { message, error } = await volcano.auth.forgotPassword('alice@example.com');

if (!error) {
  console.log('Password reset email sent');
}
```

For security, this always succeeds even if the email doesn't exist in your system.

### Reset Password

When the user clicks the reset link, extract the token and set a new password:

```javascript
const token = new URLSearchParams(window.location.search).get('token');

const { message, error } = await volcano.auth.resetPassword({
  token,
  newPassword: 'new-secure-password-456',
});

if (error) {
  console.error('Password reset failed:', error.message);
} else {
  console.log('Password updated successfully');
}
```

## Email Change

### Request Email Change

Allow users to change their email address:

```javascript
const { message, newEmail, error } = await volcano.auth.requestEmailChange('newemail@example.com');

if (!error) {
  console.log('Confirmation email sent to', newEmail);
}
```

### Confirm Email Change

After the user confirms via email:

```javascript
const token = new URLSearchParams(window.location.search).get('token');

const { user, error } = await volcano.auth.confirmEmailChange(token);

if (user) {
  console.log('Email updated to', user.email);
}
```

### Cancel Email Change

If the user changes their mind:

```javascript
const { message, error } = await volcano.auth.cancelEmailChange();

if (!error) {
  console.log('Email change cancelled');
}
```

## Update User Profile

Modify the current user's password or metadata:

```javascript
const { user, error } = await volcano.auth.updateUser({
  password: 'new-password-789', // Optional
  metadata: {
    full_name: 'Alice Johnson',
    avatar_url: 'https://example.com/alice-new.jpg',
    notification_preferences: {
      email: true,
      push: false,
    },
  },
});

if (user) {
  console.log('Profile updated');
}
```

## Multi-Device Session Management

Users can manage their active sessions across devices.

### List Sessions

Get all active sessions for the current user:

```javascript
const { sessions, total, error } = await volcano.auth.getSessions({
  page: 1,
  limit: 20,
});

if (sessions) {
  sessions.forEach((session) => {
    console.log('---');
    console.log('Device:', session.user_agent);
    console.log('IP:', session.ip_address);
    console.log('Last active:', session.last_activity_at);
    console.log('Current session:', session.is_current);
  });
}
```

### Revoke a Session

Sign out from a specific device:

```javascript
const { error } = await volcano.auth.deleteSession(sessionId);

if (!error) {
  console.log('Session revoked');
}
```

### Sign Out All Other Devices

Keep only the current session active:

```javascript
const { error } = await volcano.auth.deleteAllOtherSessions();

if (!error) {
  console.log('All other sessions have been signed out');
}
```

## Security Best Practices

### Protect Service Keys

The SDK prevents service keys (starting with `sk-`) from being used in browser environments. Service keys bypass Row-Level Security and should only be used in secure server-side code:

```javascript
// This will throw an error in the browser:
const volcano = new VolcanoAuth({
  apiUrl: 'https://api.example.com',
  anonKey: 'sk-service-key-here', // ERROR in browser!
});
```

### Use HTTPS

Always use HTTPS URLs for your API endpoint to protect tokens in transit.

### Secure Password Requirements

Enforce strong passwords in your UI before calling the SDK:

```javascript
function validatePassword(password) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain an uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain a number';
  }
  return null;
}

const passwordError = validatePassword(password);
if (passwordError) {
  showError(passwordError);
  return;
}

// Password is valid, proceed with sign up
await volcano.auth.signUp({ email, password });
```

### Handle Token Expiration

Access tokens expire after a configured time (default: 1 hour). The SDK handles refresh automatically, but you should handle the case where refresh fails:

```javascript
volcano.auth.onAuthStateChange((user) => {
  if (!user) {
    // Session expired or user signed out
    redirectToLogin();
  }
});
```

## Next Steps

- [Database](./database.md) - Query your PostgreSQL database with Row-Level Security
- [OAuth APIs](./authentication.md#access-provider-apis) - Use OAuth tokens to access provider APIs
- [Next.js](./nextjs.md) - Handle authentication in server components and middleware
