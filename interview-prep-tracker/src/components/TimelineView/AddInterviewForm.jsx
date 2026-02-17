import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { FieldLabel } from '../shared/FieldLabel';
import { FormError } from '../shared/FormError';

const EMPTY_INTERVIEW = { type: '', date: '', time: '', status: 'scheduled' };

/**
 * Inline "Add Interview" form for a single company row.
 *
 * Owns only its own ephemeral form state (shown/hidden, field values,
 * submitted flag for validation). Once submitted it calls `onAdd` and resets.
 *
 * - Type, Date, and Time are all required.
 * - Type is a dropdown driven by the `interviewTypes` prop.
 *
 * @param {{
 *   companyId:      string,
 *   onAdd:          (companyId: string, interview: Object) => void,
 *   interviewTypes: string[],
 * }} props
 */
export function AddInterviewForm({ companyId, onAdd, interviewTypes }) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [interview, setInterview] = useState(EMPTY_INTERVIEW);
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    type: !interview.type ? 'Interview type is required' : null,
    date: !interview.date ? 'Date is required'           : null,
    time: !interview.time ? 'Time is required'           : null,
  };
  const isValid = !errors.type && !errors.date && !errors.time;

  function handleSubmit() {
    setSubmitted(true);
    if (!isValid) return;
    onAdd(companyId, interview);
    setInterview(EMPTY_INTERVIEW);
    setSubmitted(false);
    setIsOpen(false);
  }

  function handleCancel() {
    setInterview(EMPTY_INTERVIEW);
    setSubmitted(false);
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
    <div className="flex flex-wrap gap-2 items-start mt-2">

      {/* Interview type — required dropdown */}
      <div>
        <FieldLabel htmlFor="interview-type" required>Type</FieldLabel>
        <select
          id="interview-type"
          value={interview.type}
          onChange={(e) => setInterview({ ...interview, type: e.target.value })}
          className="px-3 py-1 text-sm border border-gray-300 rounded"
        >
          <option value="">Select type…</option>
          {interviewTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <FormError message={submitted ? errors.type : null} />
      </div>

      {/* Date — required */}
      <div>
        <FieldLabel htmlFor="interview-date" required>Date</FieldLabel>
        <input
          id="interview-date"
          type="date"
          value={interview.date}
          onChange={(e) => setInterview({ ...interview, date: e.target.value })}
          className="px-3 py-1 text-sm border border-gray-300 rounded"
        />
        <FormError message={submitted ? errors.date : null} />
      </div>

      {/* Time — required */}
      <div>
        <FieldLabel htmlFor="interview-time" required>Time</FieldLabel>
        <input
          id="interview-time"
          type="time"
          value={interview.time}
          onChange={(e) => setInterview({ ...interview, time: e.target.value })}
          className="px-3 py-1 text-sm border border-gray-300 rounded"
        />
        <FormError message={submitted ? errors.time : null} />
      </div>

      <div className="flex items-end gap-2 pb-0.5">
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

    </div>
  );
}
