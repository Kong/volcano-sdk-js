'use client';

/**
 * Dashboard Page
 *
 * The main authenticated view where users can:
 * - View their notes
 * - Create new notes
 * - Edit existing notes
 * - Delete notes
 *
 * Protected route - redirects to sign in if not authenticated.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { NotesList } from '@/components/NotesList';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, loading, isAnonymous } = useAuth();
  const router = useRouter();

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-volcano-600" />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Notes</h1>
        <p className="mt-1 text-gray-600">Create, edit, and organize your notes.</p>
      </div>

      {/* Anonymous User Banner */}
      {isAnonymous && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-yellow-500 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                You&apos;re using a guest account
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your notes are saved, but you&apos;ll lose access if you sign out.{' '}
                <Link href="/auth/signup" className="font-medium underline hover:text-yellow-900">
                  Create an account
                </Link>{' '}
                to keep your notes permanently.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <NotesList />

      {/* Tips Section */}
      <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Tips</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="flex items-start">
            <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono mr-2">⌘ Enter</kbd>
            <span>Save note while editing</span>
          </div>
          <div className="flex items-start">
            <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono mr-2">Esc</kbd>
            <span>Cancel editing</span>
          </div>
          <div className="flex items-start">
            <span className="w-4 h-4 text-volcano-600 mr-2">✏️</span>
            <span>Click the edit icon to modify a note</span>
          </div>
          <div className="flex items-start">
            <span className="w-4 h-4 text-red-600 mr-2">🗑️</span>
            <span>Click the trash icon to delete a note</span>
          </div>
        </div>
      </div>

      {/* SDK Code Reference */}
      <div className="mt-8 bg-gray-900 rounded-lg p-6 text-white">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <svg
            className="w-5 h-5 mr-2 text-volcano-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          How it works
        </h2>
        <pre className="text-sm overflow-x-auto">
          <code className="text-green-400">
            {`// Fetch notes (RLS filters automatically)
const { data } = await volcano
  .from('notes')
  .select('*')
  .order('created_at', { ascending: false });

// Create a note
await volcano.insert('notes', {
  title: 'My Note',
  content: 'Hello World!',
  user_id: user.id
});

// Update a note
await volcano
  .update('notes', { title: 'Updated' })
  .eq('id', noteId);

// Delete a note
await volcano
  .delete('notes')
  .eq('id', noteId);`}
          </code>
        </pre>
      </div>
    </div>
  );
}
