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

import { useState } from 'react';

/**
 * Format a date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

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

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content || '');
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

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

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }

    setIsDeleting(true);
    await onDelete(note.id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER - EDITING MODE
  // ---------------------------------------------------------------------------

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-volcano-200 p-4 ring-2 ring-volcano-500">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full text-lg font-semibold text-gray-900 border-0 border-b border-gray-200 focus:border-volcano-500 focus:ring-0 pb-2 mb-2"
          placeholder="Note title"
          autoFocus
        />
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full text-gray-600 border-0 focus:ring-0 resize-none min-h-[100px]"
          placeholder="Note content..."
        />
        <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
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

  // ---------------------------------------------------------------------------
  // RENDER - VIEW MODE
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow ${
        isDeleting ? 'opacity-50' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex-1">{note.title}</h3>

        {/* Actions */}
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() => setIsEditing(true)}
            disabled={isDeleting}
            className="p-1.5 text-gray-400 hover:text-volcano-600 rounded transition-colors"
            title="Edit note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
            title="Delete note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {note.content && <p className="mt-2 text-gray-600 whitespace-pre-wrap">{note.content}</p>}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <time className="text-xs text-gray-400" dateTime={note.created_at}>
          {formatDate(note.created_at)}
        </time>
      </div>
    </div>
  );
}

export default NoteCard;
