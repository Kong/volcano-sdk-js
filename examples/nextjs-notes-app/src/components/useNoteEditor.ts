'use client';

/**
 * Note Editor Hook
 *
 * Holds NoteEditor's expanded state and draft, and creates the note on submit.
 */

import { type Dispatch, type SetStateAction, type SyntheticEvent, useCallback, useState } from 'react';
import type { NoteInput } from '@/hooks/noteRequests';

export type NoteCreateHandler = (note: NoteInput) => Promise<unknown>;

export interface NoteEditorState {
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
  isSubmitting: boolean;
  handleSubmit: (e: SyntheticEvent) => Promise<void>;
  handleCancel: () => void;
}

/**
 * @param onCreate - Create handler ({ title, content })
 */
export function useNoteEditor(onCreate: NoteCreateHandler): NoteEditorState {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();

      const note = { title: title.trim(), content: content.trim() };
      if (!note.title) {
        return;
      }

      setIsSubmitting(true);

      try {
        await onCreate(note);

        // Reset form
        setTitle('');
        setContent('');
        setIsExpanded(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    // oxlint-disable-next-line react/memo-dependencies -- The rule misses onCreate inside try/finally.
    [title, content, onCreate],
  );

  const handleCancel = useCallback(() => {
    setTitle('');
    setContent('');
    setIsExpanded(false);
  }, []);

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
