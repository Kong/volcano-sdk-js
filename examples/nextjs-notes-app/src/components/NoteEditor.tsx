'use client';

/**
 * Note Editor Component
 *
 * Form for creating new notes.
 * Collapsible design that expands when clicked.
 *
 * @example
 * <NoteEditor onCreate={handleCreate} />
 */

import { type JSX, useCallback } from 'react';
import { NoteEditorForm } from './NoteEditorForm';
import { type NoteCreateHandler, useNoteEditor } from './useNoteEditor';

interface NoteEditorProps {
  /** Create handler ({ title, content }) */
  onCreate: NoteCreateHandler;
}

export function NoteEditor({ onCreate }: NoteEditorProps): JSX.Element {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const editor = useNoteEditor(onCreate);
  const { setIsExpanded } = editor;
  const expand = useCallback(() => {
    setIsExpanded(true);
  }, [setIsExpanded]);

  // ---------------------------------------------------------------------------
  // RENDER - COLLAPSED
  // ---------------------------------------------------------------------------

  if (!editor.isExpanded) {
    return (
      <button
        onClick={expand}
        className="w-full flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left text-gray-400 hover:text-volcano-600 hover:shadow-md hover:border-volcano-300 transition-all"
      >
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">Create a new note...</span>
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER - EXPANDED
  // ---------------------------------------------------------------------------

  return <NoteEditorForm editor={editor} />;
}
