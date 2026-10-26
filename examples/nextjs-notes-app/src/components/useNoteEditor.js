'use client';

/**
 * Note Editor Hook
 *
 * Holds NoteEditor's expanded state and draft, and creates the note on submit.
 */

import { useState } from 'react';

/**
 * @param {Function} onCreate - Create handler ({ title, content })
 */
export function useNoteEditor(onCreate) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onCreate({
        title: title.trim(),
        content: content.trim(),
      });

      // Reset form
      setTitle('');
      setContent('');
      setIsExpanded(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setContent('');
    setIsExpanded(false);
  };

  return {
    isExpanded,
    setIsExpanded,
    title,
    setTitle,
    content,
    setContent,
    isSubmitting,
    handleSubmit,
    handleCancel,
  };
}
