'use client';

/**
 * Notes Hook
 *
 * Provides CRUD operations for notes using the Volcano SDK Query Builder.
 * All operations are automatically filtered by RLS (Row-Level Security),
 * so users can only access their own notes.
 *
 * @example
 * const { notes, loading, createNote, updateNote, deleteNote } = useNotes();
 *
 * // Create a note
 * await createNote({ title: 'My Note', content: 'Hello!' });
 *
 * // Update a note
 * await updateNote(noteId, { title: 'Updated Title' });
 *
 * // Delete a note
 * await deleteNote(noteId);
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import * as noteRequests from './noteRequests';
import type { DeleteNoteResult, Note, NoteInput, NoteResult } from './noteRequests';

// ---------------------------------------------------------------------------
// HOOK DEFINITION
// ---------------------------------------------------------------------------

export interface UseNotesReturn {
  /** Array of user's notes */
  notes: Note[];
  /** True while fetching notes */
  loading: boolean;
  /** Last error or null */
  error: Error | null;
  /** Refetch notes from server */
  refresh: () => Promise<void>;
  /** Create a new note */
  createNote: (noteData: NoteInput) => Promise<NoteResult>;
  /** Update an existing note */
  updateNote: (noteId: string, updates: Partial<NoteInput>) => Promise<NoteResult>;
  /** Delete a note */
  deleteNote: (noteId: string) => Promise<DeleteNoteResult>;
}

/**
 * Hook for managing notes
 *
 * Automatically fetches notes when user is authenticated.
 * All operations include optimistic updates for better UX.
 */
export function useNotes(): UseNotesReturn {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get current user from auth context
  const { user } = useAuth();

  // The SDK queries live in ./noteRequests.ts
  const fetchNotes = useCallback(() => noteRequests.fetchNotes({ user, setNotes, setLoading, setError }), [user]);

  // Fetch notes when user changes
  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback(
    (noteData: NoteInput) => noteRequests.createNote({ user, setNotes, setError }, noteData),
    [user],
  );

  const updateNote = useCallback(
    (noteId: string, updates: Partial<NoteInput>) =>
      noteRequests.updateNote({ user, notes, setNotes, setError }, noteId, updates),
    [user, notes],
  );

  const deleteNote = useCallback(
    (noteId: string) => noteRequests.deleteNote({ user, notes, setNotes, setError }, noteId),
    [user, notes],
  );

  // ---------------------------------------------------------------------------
  // RETURN VALUE
  // ---------------------------------------------------------------------------

  return {
    notes,
    loading,
    error,
    refresh: fetchNotes,
    createNote,
    updateNote,
    deleteNote,
  };
}
