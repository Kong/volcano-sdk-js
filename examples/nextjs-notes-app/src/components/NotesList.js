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
import { NotesEmptyState, NotesListError, NotesListSkeleton } from './NotesListStates';

function NotesCount({ count }) {
  if (count === 0) {
    return null;
  }
  return (
    <p className="text-center text-sm text-gray-500">
      {count} {count === 1 ? 'note' : 'notes'}
    </p>
  );
}

export function NotesList() {
  // ---------------------------------------------------------------------------
  // DATA
  // ---------------------------------------------------------------------------

  const { notes, loading, error, createNote, updateNote, deleteNote } = useNotes();

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  // Loading state
  if (loading) {
    return <NotesListSkeleton />;
  }

  // Error state
  if (error) {
    return <NotesListError error={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Create new note */}
      <NoteEditor onCreate={createNote} />

      {/* Notes grid */}
      {notes.length === 0 ? (
        // Empty state
        <NotesEmptyState />
      ) : (
        // Notes grid
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onEdit={updateNote} onDelete={deleteNote} />
          ))}
        </div>
      )}

      {/* Notes count */}
      <NotesCount count={notes.length} />
    </div>
  );
}
