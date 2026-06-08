'use client';

/**
 * Notes List Component
 *
 * Displays a grid of notes with create, edit, and delete functionality.
 * Shows appropriate empty states and loading states.
 *
 * @example
 * <NotesList />
 */

import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from './NoteCard';
import { NoteEditor } from './NoteEditor';

export function NotesList() {
  // ---------------------------------------------------------------------------
  // DATA
  // ---------------------------------------------------------------------------

  const { notes, loading, error, createNote, updateNote, deleteNote } = useNotes();

  // ---------------------------------------------------------------------------
  // RENDER - LOADING STATE
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton loader */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
          <div className="h-3 bg-gray-200 rounded w-full mb-2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
          <div className="h-3 bg-gray-200 rounded w-full mb-2" />
          <div className="h-3 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER - ERROR STATE
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg
            className="w-5 h-5 text-red-500 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Failed to load notes</h3>
            <p className="mt-1 text-sm text-red-700">
              {error.message || 'An error occurred while loading your notes.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Create new note */}
      <NoteEditor onCreate={createNote} />

      {/* Notes grid */}
      {notes.length === 0 ? (
        // Empty state
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No notes yet</h3>
          <p className="text-gray-500">Create your first note using the form above.</p>
        </div>
      ) : (
        // Notes grid
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onEdit={updateNote} onDelete={deleteNote} />
          ))}
        </div>
      )}

      {/* Notes count */}
      {notes.length > 0 && (
        <p className="text-center text-sm text-gray-500">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </p>
      )}
    </div>
  );
}

export default NotesList;
