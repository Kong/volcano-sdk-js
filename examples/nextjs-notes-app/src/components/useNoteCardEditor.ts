'use client';

/**
 * Note Card Editing Hook
 *
 * Holds NoteCard's inline-edit state and its save, cancel, and keyboard handlers.
 */

import { type Dispatch, type KeyboardEvent, type SetStateAction, useCallback, useState } from 'react';
import type { Note, NoteInput } from '@/hooks/noteRequests';

export type NoteEditHandler = (noteId: string, updates: Partial<NoteInput>) => Promise<unknown>;

export interface NoteCardEditorState {
  isEditing: boolean;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  editTitle: string;
  setEditTitle: Dispatch<SetStateAction<string>>;
  editContent: string;
  setEditContent: Dispatch<SetStateAction<string>>;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

/**
 * @param note - Note being edited
 * @param onEdit - Edit handler (noteId, updates)
 */
export function useNoteCardEditor(note: Note, onEdit: NoteEditHandler): NoteCardEditorState {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content ?? '');

  const handleSave = useCallback(async () => {
    if (!editTitle.trim()) {
      return;
    }

    await onEdit(note.id, {
      title: editTitle.trim(),
      content: editContent.trim(),
    });

    setIsEditing(false);
  }, [editTitle, editContent, onEdit, note.id]);

  const handleCancel = useCallback(() => {
    setEditTitle(note.title);
    setEditContent(note.content ?? '');
    setIsEditing(false);
  }, [note.title, note.content]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && e.metaKey) {
        void handleSave();
      }
    },
    [handleCancel, handleSave],
  );

  return {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    handleSave,
    handleCancel,
    handleKeyDown,
  };
}
