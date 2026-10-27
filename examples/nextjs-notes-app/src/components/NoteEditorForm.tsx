'use client';

/**
 * Note Editor Form
 *
 * NoteEditor once expanded: title and content inputs with save and cancel.
 */

import { type JSX, type KeyboardEvent, useCallback } from 'react';
import { useAsyncHandler, useInputChange } from '@/hooks/eventHandlers';
import type { NoteEditorState } from './useNoteEditor';

interface NoteEditorFormProps {
  /** Draft state and handlers from useNoteEditor */
  editor: NoteEditorState;
}

export function NoteEditorForm({ editor }: NoteEditorFormProps): JSX.Element {
  const { title, setTitle, content, setContent, isSubmitting, handleSubmit, handleCancel } = editor;

  const handleTitleChange = useInputChange(setTitle);
  const handleContentChange = useInputChange(setContent);
  const handleFormSubmit = useAsyncHandler(handleSubmit);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && e.metaKey) {
        void handleSubmit(e);
      }
    },
    [handleCancel, handleSubmit],
  );

  return (
    <form
      onSubmit={handleFormSubmit}
      className="bg-white rounded-lg shadow-md border border-volcano-200 p-4 ring-2 ring-volcano-500"
    >
      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        onKeyDown={handleKeyDown}
        className="w-full text-lg font-semibold text-gray-900 border-0 border-b border-gray-200 focus:border-volcano-500 focus:ring-0 pb-2 mb-2"
        placeholder="Note title"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- The button that had focus unmounts as this form opens.
        autoFocus
      />
      <textarea
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        className="w-full text-gray-600 border-0 focus:ring-0 resize-none min-h-[100px]"
        placeholder="Write your note here..."
      />

      {/* Actions */}
      <NoteEditorActions title={title} isSubmitting={isSubmitting} onCancel={handleCancel} />
    </form>
  );
}

interface NoteEditorActionsProps {
  title: string;
  isSubmitting: boolean;
  onCancel: () => void;
}

function NoteEditorActions({ title, isSubmitting, onCancel }: NoteEditorActionsProps) {
  return (
    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs text-gray-400">
        Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">⌘ Enter</kbd> to save
      </p>
      <div className="flex space-x-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
        <button
          type="submit"
          disabled={title.trim() === '' || isSubmitting}
          className="px-4 py-1.5 text-sm bg-volcano-600 text-white rounded-md hover:bg-volcano-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Creating...
            </>
          ) : (
            'Create Note'
          )}
        </button>
      </div>
    </div>
  );
}
