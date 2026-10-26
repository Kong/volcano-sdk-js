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

// ---------------------------------------------------------------------------
// HOOK DEFINITION
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Note
 * @property {string} id - Unique note ID (UUID)
 * @property {string} user_id - Owner's user ID
 * @property {string} title - Note title
 * @property {string} content - Note content (can be empty)
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 */

/**
 * @typedef {Object} UseNotesReturn
 * @property {Note[]} notes - Array of user's notes
 * @property {boolean} loading - True while fetching notes
 * @property {Error|null} error - Last error or null
 * @property {Function} refresh - Refetch notes from server
 * @property {Function} createNote - Create a new note
 * @property {Function} updateNote - Update an existing note
 * @property {Function} deleteNote - Delete a note
 */

/**
 * Hook for managing notes
 *
 * Automatically fetches notes when user is authenticated.
 * All operations include optimistic updates for better UX.
 *
 * @returns {UseNotesReturn}
 */
export function useNotes() {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get current user from auth context
  const { user } = useAuth();

  // The SDK queries live in ./noteRequests.js
  const fetchNotes = useCallback(() => noteRequests.fetchNotes({ user, setNotes, setLoading, setError }), [user]);

  // Fetch notes when user changes
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback((noteData) => noteRequests.createNote({ user, setNotes, setError }, noteData), [user]);

  const updateNote = useCallback(
    (noteId, updates) => noteRequests.updateNote({ user, notes, setNotes, setError }, noteId, updates),
    [user, notes],
  );

  const deleteNote = useCallback(
    (noteId) => noteRequests.deleteNote({ user, notes, setNotes, setError }, noteId),
    [user, notes],
  );

  // ---------------------------------------------------------------------------
  // RETURN VALUE
  // ---------------------------------------------------------------------------

  return {
    // Data
    notes,
    loading,
    error,

    // Methods
    refresh: fetchNotes,
    createNote,
    updateNote,
    deleteNote,
  };
}
