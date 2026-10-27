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

import { type JSX, useCallback, useState } from 'react';
import type { Note } from '@/hooks/noteRequests';
import { NoteCardEditor } from './NoteCardEditor';
import { NoteCardView } from './NoteCardView';
import { type NoteEditHandler, useNoteCardEditor } from './useNoteCardEditor';

interface NoteCardProps {
  note: Note;
  /** Edit handler (noteId, updates) */
  onEdit: NoteEditHandler;
  /** Delete handler (noteId) */
  onDelete: (noteId: string) => Promise<unknown>;
}

export function NoteCard({ note, onEdit, onDelete }: NoteCardProps): JSX.Element {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const editor = useNoteCardEditor(note, onEdit);
  const { setIsEditing } = editor;
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, [setIsEditing]);

  const handleDelete = useCallback(() => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }

    setIsDeleting(true);
    void onDelete(note.id);
  }, [onDelete, note.id]);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (editor.isEditing) {
    return <NoteCardEditor editor={editor} />;
  }

  return <NoteCardView note={note} isDeleting={isDeleting} onEdit={handleEdit} onDelete={handleDelete} />;
}
