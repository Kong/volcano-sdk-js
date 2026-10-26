'use client';

/**
 * Note Card View
 *
 * NoteCard in view mode: the note with its edit and delete actions.
 */

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

  return formatCalendarDate(date, now);
}

function formatCalendarDate(date, now) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * @param {Object} props
 * @param {Object} props.note - Note object
 * @param {boolean} props.isDeleting - True while the note is being deleted
 * @param {Function} props.onEdit - Switches the card to editing mode
 * @param {Function} props.onDelete - Delete handler
 */
export function NoteCardView({ note, isDeleting, onEdit, onDelete }) {
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
        <NoteCardActions isDeleting={isDeleting} onEdit={onEdit} onDelete={onDelete} />
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

function NoteCardActions({ isDeleting, onEdit, onDelete }) {
  return (
    <div className="flex items-center space-x-1 ml-2">
      <button
        onClick={onEdit}
        disabled={isDeleting}
        className="p-1.5 text-gray-400 hover:text-volcano-600 rounded transition-colors"
        title="Edit note"
        aria-label="Edit note"
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
        onClick={onDelete}
        disabled={isDeleting}
        className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
        title="Delete note"
        aria-label="Delete note"
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
  );
}
