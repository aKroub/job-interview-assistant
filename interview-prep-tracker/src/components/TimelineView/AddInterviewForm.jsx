import React, { useState } from 'react';
import { Plus } from 'lucide-react';

const EMPTY_INTERVIEW = { type: '', date: '', time: '', status: 'scheduled' };

/**
 * Inline "Add Interview" form for a single company row.
 *
 * Owns only its own ephemeral form state (shown/hidden, field values) —
 * this is local UI state that doesn't need to live in the global store.
 * Once submitted it calls `onAdd` and resets itself.
 *
 * @param {{
 *   companyId: string,
 *   onAdd:     (companyId: string, interview: Object) => void,
 * }} props
 */
export function AddInterviewForm({ companyId, onAdd }) {
  const [isOpen, setIsOpen]       = useState(false);
  const [interview, setInterview] = useState(EMPTY_INTERVIEW);

  function handleSubmit() {
    if (!interview.type || !interview.date) return;
    onAdd(companyId, interview);
    setInterview(EMPTY_INTERVIEW);
    setIsOpen(false);
  }

  function handleCancel() {
    setInterview(EMPTY_INTERVIEW);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        <Plus size={16} />
        Add Interview
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        placeholder="Interview type"
        value={interview.type}
        onChange={(e) => setInterview({ ...interview, type: e.target.value })}
        className="px-3 py-1 text-sm border border-gray-300 rounded"
        maxLength={60}
      />
      <input
        type="date"
        value={interview.date}
        onChange={(e) => setInterview({ ...interview, date: e.target.value })}
        className="px-3 py-1 text-sm border border-gray-300 rounded"
      />
      <input
        type="time"
        value={interview.time}
        onChange={(e) => setInterview({ ...interview, time: e.target.value })}
        className="px-3 py-1 text-sm border border-gray-300 rounded"
      />
      <button
        onClick={handleSubmit}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        Add
      </button>
      <button
        onClick={handleCancel}
        className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
      >
        Cancel
      </button>
    </div>
  );
}
