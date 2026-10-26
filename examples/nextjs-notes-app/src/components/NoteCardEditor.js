'use client';

/**
 * Note Card Editor
 *
 * NoteCard in editing mode: inline title and content inputs.
 */

import { useCallback } from 'react';

/**
 * @param {Object} props
 * @param {Object} props.editor - Edit state and handlers from useNoteCardEditor
 */
export function NoteCardEditor({ editor }) {
  const { editTitle, setEditTitle, editContent, setEditContent, handleSave, handleCancel, handleKeyDown } = editor;
  const handleTitleChange = useCallback((e) => setEditTitle(e.target.value), [setEditTitle]);
  const handleContentChange = useCallback((e) => setEditContent(e.target.value), [setEditContent]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-volcano-200 p-4 ring-2 ring-volcano-500">
      <input
        type="text"
        value={editTitle}
        onChange={handleTitleChange}
        onKeyDown={handleKeyDown}
        className="w-full text-lg font-semibold text-gray-900 border-0 border-b border-gray-200 focus:border-volcano-500 focus:ring-0 pb-2 mb-2"
        placeholder="Note title"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- The Edit button that had focus unmounts as this opens.
        autoFocus
      />
      <textarea
        value={editContent}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        className="w-full text-gray-600 border-0 focus:ring-0 resize-none min-h-[100px]"
        placeholder="Note content..."
      />
      <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
        <button onClick={handleCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!editTitle.trim()}
          className="px-3 py-1.5 text-sm bg-volcano-600 text-white rounded-md hover:bg-volcano-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">⌘ Enter</kbd> to save,{' '}
        <kbd className="px-1 py-0.5 bg-gray-100 rounded">Esc</kbd> to cancel
      </p>
    </div>
  );
}
