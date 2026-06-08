# Volcano Notes - Next.js Example Application

A full-featured notes application demonstrating the **Volcano SDK** capabilities:

- **Authentication** - Email/password signup, signin, and anonymous users
- **Password Recovery** - Forgot password flow with email verification
- **Database Operations** - CRUD operations with Row-Level Security
- **Session Management** - Automatic token refresh and persistence

## Features Demonstrated

| Feature         | SDK Method                             | Description                  |
| --------------- | -------------------------------------- | ---------------------------- |
| Sign Up         | `volcano.auth.signUp()`                | Create new user account      |
| Sign In         | `volcano.auth.signIn()`                | Authenticate existing user   |
| Anonymous       | `volcano.auth.signInAnonymously()`     | Quick access without account |
| Sign Out        | `volcano.auth.signOut()`               | End session                  |
| Password Reset  | `volcano.auth.resetPasswordForEmail()` | Send reset email             |
| Session Restore | `volcano.initialize()`                 | Restore session on page load |
| Query Data      | `volcano.from().select()`              | Fetch notes with filters     |
| Insert Data     | `volcano.insert()`                     | Create new notes             |
| Update Data     | `volcano.update().eq()`                | Modify existing notes        |
| Delete Data     | `volcano.delete().eq()`                | Remove notes                 |

## Quick Start

### 1. Prerequisites

- Node.js 20+
- A Volcano project
- A database with the `notes` table (see schema below)

### 2. Database Setup

Create the `notes` table in your Volcano database:

```sql
-- Create the notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row-Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notes
CREATE POLICY "Users can view own notes"
  ON notes FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can insert their own notes
CREATE POLICY "Users can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own notes
CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  USING (user_id = auth.uid());

-- Index for faster queries
CREATE INDEX notes_user_id_idx ON notes(user_id);
CREATE INDEX notes_created_at_idx ON notes(created_at DESC);
```

### 3. Environment Setup

```bash
cd examples/nextjs-notes-app
cp .env.example .env.local
```

Edit `.env.local` with your Volcano project credentials:

```env
NEXT_PUBLIC_VOLCANO_API_URL=https://api.your-project.volcano.hosting
NEXT_PUBLIC_VOLCANO_ANON_KEY=your-anon-key
NEXT_PUBLIC_VOLCANO_DATABASE_NAME=your_database_name
```

### 4. Install & Run

```bash
# From the repository root, build the local SDK package used by this example.
pnpm install
pnpm build

pnpm --dir examples/nextjs-notes-app dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
nextjs-notes-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.js           # Root layout with providers
│   │   ├── page.js             # Landing page
│   │   ├── auth/
│   │   │   ├── signin/         # Sign in page
│   │   │   ├── signup/         # Sign up page
│   │   │   └── forgot-password/# Password reset page
│   │   └── dashboard/
│   │       └── page.js         # Protected dashboard with notes
│   │
│   ├── components/             # Reusable UI components
│   │   ├── AuthForm.js         # Authentication form
│   │   ├── NoteCard.js         # Individual note display
│   │   ├── NoteEditor.js       # Note create/edit form
│   │   ├── NotesList.js        # Notes grid/list
│   │   └── Navbar.js           # Navigation bar
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAuth.js          # Authentication state & methods
│   │   └── useNotes.js         # Notes CRUD operations
│   │
│   ├── lib/
│   │   └── volcano.js          # SDK initialization
│   │
│   └── context/
│       └── AuthContext.js      # Auth state provider
│
├── .env.example                # Environment template
├── package.json
├── tailwind.config.js
└── README.md
```

## Code Patterns

### SDK Initialization (`src/lib/volcano.js`)

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

// Create a singleton instance
export const volcano = new VolcanoAuth({
  apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY,
});

// Set database for queries
volcano.database(process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME);
```

### Authentication Hook (`src/hooks/useAuth.js`)

```javascript
// Get current user
const { user, loading, error } = useAuth();

// Sign in
await signIn({ email, password });

// Sign up
await signUp({ email, password, metadata: { name } });

// Anonymous login
await signInAnonymously();

// Sign out
await signOut();
```

### Notes Hook (`src/hooks/useNotes.js`)

```javascript
// Fetch all notes
const { notes, loading, error, refresh } = useNotes();

// Create a note
await createNote({ title, content });

// Update a note
await updateNote(noteId, { title, content });

// Delete a note
await deleteNote(noteId);
```

## Key Concepts

### Row-Level Security (RLS)

Notes are automatically filtered by user. When you query:

```javascript
const { data } = await volcano.from('notes').select('*');
```

The database automatically applies: `WHERE user_id = auth.uid()`

You only see YOUR notes. No extra code needed!

### Session Persistence

Sessions are automatically saved to `localStorage`. When the app loads:

```javascript
// In AuthContext.js
useEffect(() => {
  volcano.initialize().then(({ user }) => {
    setUser(user);
  });
}, []);
```

### Anonymous Users

Anonymous users get a temporary account:

```javascript
await volcano.auth.signInAnonymously();
// User can create notes immediately
// Later, they can "upgrade" to a full account
```

## Customization

### Adding More Fields to Notes

1. Update the database schema:

```sql
ALTER TABLE notes ADD COLUMN color TEXT DEFAULT 'white';
ALTER TABLE notes ADD COLUMN pinned BOOLEAN DEFAULT false;
```

2. Update the SDK queries:

```javascript
const { data } = await volcano
  .from('notes')
  .select('id, title, content, color, pinned, created_at')
  .order('pinned', { ascending: false })
  .order('created_at', { ascending: false });
```

### Adding Real-time Updates

```javascript
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';

const realtime = new VolcanoRealtime({
  apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY,
  accessToken: volcano.accessToken,
});

const channel = realtime.channel('notes', { type: 'postgres' });

channel.onPostgresChanges('*', 'public', 'notes', (change) => {
  console.log('Note changed:', change);
  refresh(); // Re-fetch notes
});

await channel.subscribe();
```

## Troubleshooting

### "No active session" error

Make sure you're signed in before querying the database:

```javascript
const { user } = await volcano.auth.getUser();
if (!user) {
  // Redirect to login
}
```

### Notes not appearing

1. Check RLS policies are created correctly
2. Verify `user_id` is set when inserting:

```javascript
// The SDK automatically sets user context
// But if using raw SQL, ensure user_id matches auth.uid()
```

### Token expired

The SDK automatically refreshes tokens. If issues persist:

```javascript
await volcano.auth.refreshSession();
```

## Learn More

- [Volcano SDK Documentation](../README.md)
- [Authentication Guide](../../docs/authentication/)
- [Database Queries](../../docs/databases/query-builder-api.md)
- [Row-Level Security](../../docs/databases/row-level-security.md)

## License

Apache License 2.0 - use this example as a starting point for your own projects.
