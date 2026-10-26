'use client';

/**
 * Note Card Editing Hook
 *
 * Holds NoteCard's inline-edit state and its save, cancel, and keyboard handlers.
 */

import { useState } from 'react';

/**
 * @param {Object} note - Note being edited
 * @param {Function} onEdit - Edit handler (noteId, updates)
 */
export function useNoteCardEditor(note, onEdit) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content || '');

  const handleSave = async () => {
    if (!editTitle.trim()) {
      return;
    }

    await onEdit(note.id, {
      title: editTitle.trim(),
      content: editContent.trim(),
    });

    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(note.title);
    setEditContent(note.content || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    }
  };

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
