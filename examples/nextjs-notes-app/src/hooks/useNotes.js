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
import { volcano } from '@/lib/volcano';

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

  // ---------------------------------------------------------------------------
  // FETCH NOTES
  // ---------------------------------------------------------------------------

  /**
   * Fetch all notes for the current user
   *
   * Notes are automatically filtered by RLS - you only get YOUR notes.
   * Results are ordered by creation date (newest first).
   */
  const fetchNotes = useCallback(async () => {
    // Don't fetch if not authenticated
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query notes using the Volcano Query Builder
      // RLS automatically filters: WHERE user_id = auth.uid()
      const { data, error: queryError } = await volcano
        .from('notes')
        .select('id, title, content, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (queryError) {
        setError(queryError);
        console.error('Failed to fetch notes:', queryError);
        return;
      }

      setNotes(data || []);
    } catch (err) {
      setError(err);
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch notes when user changes
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // ---------------------------------------------------------------------------
  // CREATE NOTE
  // ---------------------------------------------------------------------------

  /**
   * Create a new note
   *
   * @param {Object} noteData
   * @param {string} noteData.title - Note title (required)
   * @param {string} [noteData.content] - Note content (optional)
   * @returns {Promise<{note: Note|null, error: Error|null}>}
   *
   * @example
   * const { note, error } = await createNote({
   *   title: 'Shopping List',
   *   content: '- Milk\n- Eggs\n- Bread'
   * });
   */
  const createNote = useCallback(
    async ({ title, content = '' }) => {
      if (!user) {
        return { note: null, error: new Error('Must be signed in to create notes') };
      }

      setError(null);

      try {
        // Insert note using the Volcano SDK
        // user_id is automatically set by RLS to auth.uid()
        const { data, error: insertError } = await volcano.insert('notes', {
          title,
          content,
          user_id: user.id, // Explicitly set for clarity (RLS validates this)
        });

        if (insertError) {
          setError(insertError);
          return { note: null, error: insertError };
        }

        const newNote = data?.[0];

        // Optimistically add to local state
        if (newNote) {
          setNotes((prev) => [newNote, ...prev]);
        }

        return { note: newNote, error: null };
      } catch (err) {
        setError(err);
        return { note: null, error: err };
      }
    },
    [user],
  );

  // ---------------------------------------------------------------------------
  // UPDATE NOTE
  // ---------------------------------------------------------------------------

  /**
   * Update an existing note
   *
   * @param {string} noteId - ID of the note to update
   * @param {Object} updates - Fields to update
   * @param {string} [updates.title] - New title
   * @param {string} [updates.content] - New content
   * @returns {Promise<{note: Note|null, error: Error|null}>}
   *
   * @example
   * const { note, error } = await updateNote(noteId, {
   *   title: 'Updated Title',
   *   content: 'New content here'
   * });
   */
  const updateNote = useCallback(
    async (noteId, updates) => {
      if (!user) {
        return { note: null, error: new Error('Must be signed in to update notes') };
      }

      setError(null);

      // Store original for rollback
      const originalNotes = notes;

      // Optimistically update local state
      setNotes((prev) =>
        prev.map((note) =>
          note.id === noteId ? { ...note, ...updates, updated_at: new Date().toISOString() } : note,
        ),
      );

      try {
        // Update using the Volcano SDK
        // RLS ensures you can only update YOUR notes
        const { data, error: updateError } = await volcano
          .update('notes', {
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (updateError) {
          // Rollback on error
          setNotes(originalNotes);
          setError(updateError);
          return { note: null, error: updateError };
        }

        const updatedNote = data?.[0];
        return { note: updatedNote, error: null };
      } catch (err) {
        // Rollback on error
        setNotes(originalNotes);
        setError(err);
        return { note: null, error: err };
      }
    },
    [user, notes],
  );

  // ---------------------------------------------------------------------------
  // DELETE NOTE
  // ---------------------------------------------------------------------------

  /**
   * Delete a note
   *
   * @param {string} noteId - ID of the note to delete
   * @returns {Promise<{error: Error|null}>}
   *
   * @example
   * const { error } = await deleteNote(noteId);
   * if (!error) {
   *   console.log('Note deleted successfully');
   * }
   */
  const deleteNote = useCallback(
    async (noteId) => {
      if (!user) {
        return { error: new Error('Must be signed in to delete notes') };
      }

      setError(null);

      // Store original for rollback
      const originalNotes = notes;

      // Optimistically remove from local state
      setNotes((prev) => prev.filter((note) => note.id !== noteId));

      try {
        // Delete using the Volcano SDK
        // RLS ensures you can only delete YOUR notes
        const { error: deleteError } = await volcano.delete('notes').eq('id', noteId);

        if (deleteError) {
          // Rollback on error
          setNotes(originalNotes);
          setError(deleteError);
          return { error: deleteError };
        }

        return { error: null };
      } catch (err) {
        // Rollback on error
        setNotes(originalNotes);
        setError(err);
        return { error: err };
      }
    },
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

export default useNotes;
