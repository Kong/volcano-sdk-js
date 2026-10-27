/**
 * Note Requests
 *
 * The Volcano SDK queries behind useNotes. Each one mirrors its result into
 * the hook's state. All queries are filtered by RLS (Row-Level Security), so
 * users can only reach their own notes.
 */

import type { User } from '@volcano.dev/sdk';
import type { Dispatch, SetStateAction } from 'react';
import { toError } from '@/lib/errors';
import { volcano } from '@/lib/volcano';

/**
 * A row of the `notes` table
 */
export interface Note {
  /** Unique note ID (UUID) */
  id: string;
  /** Owner's user ID; fetchNotes does not select it */
  user_id?: string;
  title: string;
  /** Note content (can be empty) */
  content: string | null;
  /** ISO timestamp */
  created_at: string;
  /** ISO timestamp */
  updated_at: string;
}

/**
 * The fields a user writes when creating or editing a note
 */
export interface NoteInput {
  /** Note title (required) */
  title: string;
  /** Note content (optional) */
  content?: string;
}

export interface NoteResult {
  note: Note | null;
  error: Error | null;
}

export interface DeleteNoteResult {
  error: Error | null;
}

/**
 * The useNotes state a request reads and updates
 */
interface NotesState {
  /** Current authenticated user */
  user: User | null;
  setNotes: Dispatch<SetStateAction<Note[]>>;
  setError: Dispatch<SetStateAction<Error | null>>;
}

interface FetchNotesState extends NotesState {
  setLoading: Dispatch<SetStateAction<boolean>>;
}

interface ChangeNotesState extends NotesState {
  /** Notes before the change, for rollback */
  notes: Note[];
}

function firstRow(data: Note[] | null): Note | null {
  return data?.[0] ?? null;
}

function addCreatedNote(data: Note[] | null, setNotes: NotesState['setNotes']): Note | null {
  const newNote = firstRow(data);
  if (newNote !== null) {
    setNotes((previous) => [newNote, ...previous]);
  }
  return newNote;
}

/**
 * Fetch all notes for the current user
 *
 * Notes are automatically filtered by RLS - you only get YOUR notes.
 * Results are ordered by creation date (newest first).
 */
export async function fetchNotes({ user, setNotes, setLoading, setError }: FetchNotesState): Promise<void> {
  // Don't fetch if not authenticated
  if (user === null) {
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
      .from<Note>('notes')
      .select('id, title, content, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (queryError !== null) {
      setError(queryError);
      console.error('Failed to fetch notes:', queryError);
      return;
    }

    setNotes(data ?? []);
  } catch (err) {
    setError(toError(err));
    console.error('Failed to fetch notes:', err);
  } finally {
    setLoading(false);
  }
}

/**
 * Create a new note
 *
 * @example
 * const { note, error } = await createNote({
 *   title: 'Shopping List',
 *   content: '- Milk\n- Eggs\n- Bread'
 * });
 */
export async function createNote(
  { user, setNotes, setError }: NotesState,
  { title, content = '' }: NoteInput,
): Promise<NoteResult> {
  if (user === null) {
    return { note: null, error: new Error('Must be signed in to create notes') };
  }

  setError(null);

  try {
    // Insert note using the Volcano SDK
    // user_id is automatically set by RLS to auth.uid()
    const { data, error: insertError } = await volcano.insert<Note>('notes', {
      title,
      content,
      // Explicitly set for clarity (RLS validates this)
      user_id: user.id,
    });

    if (insertError !== null) {
      setError(insertError);
      return { note: null, error: insertError };
    }

    // Optimistically add to local state
    const newNote = addCreatedNote(data, setNotes);

    return { note: newNote, error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { note: null, error };
  }
}

/**
 * Update an existing note
 *
 * @example
 * const { note, error } = await updateNote(noteId, {
 *   title: 'Updated Title',
 *   content: 'New content here'
 * });
 */
export async function updateNote(
  { user, notes, setNotes, setError }: ChangeNotesState,
  noteId: string,
  updates: Partial<NoteInput>,
): Promise<NoteResult> {
  if (user === null) {
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
      .update<Note>('notes', {
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId);

    if (updateError !== null) {
      // Rollback on error
      setNotes(originalNotes);
      setError(updateError);
      return { note: null, error: updateError };
    }

    const updatedNote = firstRow(data);
    return { note: updatedNote, error: null };
  } catch (err) {
    // Rollback on error
    const error = toError(err);
    setNotes(originalNotes);
    setError(error);
    return { note: null, error };
  }
}

/**
 * Delete a note
 *
 * @example
 * const { error } = await deleteNote(noteId);
 * if (!error) {
 *   console.log('Note deleted successfully');
 * }
 */
export async function deleteNote(
  { user, notes, setNotes, setError }: ChangeNotesState,
  noteId: string,
): Promise<DeleteNoteResult> {
  if (user === null) {
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
    const { error: deleteError } = await volcano.delete<Note>('notes').eq('id', noteId);

    if (deleteError !== null) {
      // Rollback on error
      setNotes(originalNotes);
      setError(deleteError);
      return { error: deleteError };
    }

    return { error: null };
  } catch (err) {
    // Rollback on error
    const error = toError(err);
    setNotes(originalNotes);
    setError(error);
    return { error };
  }
}
