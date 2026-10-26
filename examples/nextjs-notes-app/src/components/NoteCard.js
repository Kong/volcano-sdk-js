'use client';

/**
 * Note Card Component
 *
 * Displays a single note with edit and delete actions.
 * Supports inline editing for quick updates.
 *
 * @example
 * <NoteCard
 *   note={note}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 * />
 */

import { useCallback, useState } from 'react';
import { NoteCardEditor } from './NoteCardEditor';
import { NoteCardView } from './NoteCardView';
import { useNoteCardEditor } from './useNoteCardEditor';

/**
 * @param {Object} props
 * @param {Object} props.note - Note object
 * @param {Function} props.onEdit - Edit handler (noteId, updates)
 * @param {Function} props.onDelete - Delete handler (noteId)
 */
export function NoteCard({ note, onEdit, onDelete }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const editor = useNoteCardEditor(note, onEdit);
  const { setIsEditing } = editor;
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleEdit = useCallback(() => setIsEditing(true), [setIsEditing]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }

    setIsDeleting(true);
    await onDelete(note.id);
  }, [onDelete, note.id]);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (editor.isEditing) {
    return <NoteCardEditor editor={editor} />;
  }

  return <NoteCardView note={note} isDeleting={isDeleting} onEdit={handleEdit} onDelete={handleDelete} />;
}
