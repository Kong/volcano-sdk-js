/**
 * Note Requests
 *
 * The Volcano SDK queries behind useNotes. Each one mirrors its result into
 * the hook's state. All queries are filtered by RLS (Row-Level Security), so
 * users can only reach their own notes.
 */

import { volcano } from '@/lib/volcano';

/**
 * @typedef {Object} NotesState
 * @property {Object|null} user - Current authenticated user
 * @property {Note[]} [notes] - Notes before the change, for rollback
 * @property {Function} setNotes - Sets the notes
 * @property {Function} [setLoading] - Sets the loading flag
 * @property {Function} setError - Sets the last error
 */

function addCreatedNote(data, setNotes) {
  const newNote = data?.[0];
  if (newNote) {
    setNotes((previous) => [newNote, ...previous]);
  }
  return newNote;
}

/**
 * Fetch all notes for the current user
 *
 * Notes are automatically filtered by RLS - you only get YOUR notes.
 * Results are ordered by creation date (newest first).
 *
 * @param {NotesState} state
 */
export async function fetchNotes({ user, setNotes, setLoading, setError }) {
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
}

/**
 * Create a new note
 *
 * @param {NotesState} state
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
export async function createNote({ user, setNotes, setError }, { title, content = '' }) {
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
      // Explicitly set for clarity (RLS validates this)
      user_id: user.id,
    });

    if (insertError) {
      setError(insertError);
      return { note: null, error: insertError };
    }

    // Optimistically add to local state
    const newNote = addCreatedNote(data, setNotes);

    return { note: newNote, error: null };
  } catch (err) {
    setError(err);
    return { note: null, error: err };
  }
}

/**
 * Update an existing note
 *
 * @param {NotesState} state
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
export async function updateNote({ user, notes, setNotes, setError }, noteId, updates) {
  if (!user) {
    return { note: null, error: new Error('Must be signed in to update notes') };
  }

  setError(null);

  // Store original for rollback
  const originalNotes = notes;

  // Optimistically update local state
  setNotes((prev) =>
    prev.map((note) => (note.id === noteId ? { ...note, ...updates, updated_at: new Date().toISOString() } : note)),
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
}

/**
 * Delete a note
 *
 * @param {NotesState} state
 * @param {string} noteId - ID of the note to delete
 * @returns {Promise<{error: Error|null}>}
 *
 * @example
 * const { error } = await deleteNote(noteId);
 * if (!error) {
 *   console.log('Note deleted successfully');
 * }
 */
export async function deleteNote({ user, notes, setNotes, setError }, noteId) {
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
}
