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

import { NoteEditorForm } from './NoteEditorForm';
import { useNoteEditor } from './useNoteEditor';

/**
 * @param {Object} props
 * @param {Function} props.onCreate - Create handler ({ title, content })
 */
export function NoteEditor({ onCreate }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const editor = useNoteEditor(onCreate);

  // ---------------------------------------------------------------------------
  // RENDER - COLLAPSED
  // ---------------------------------------------------------------------------

  if (!editor.isExpanded) {
    return (
      <button
        onClick={() => editor.setIsExpanded(true)}
        className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:shadow-md hover:border-volcano-300 transition-all group"
      >
        <div className="flex items-center text-gray-400 group-hover:text-volcano-600">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-medium">Create a new note...</span>
        </div>
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER - EXPANDED
  // ---------------------------------------------------------------------------

  return <NoteEditorForm editor={editor} />;
}
