import React, { useState } from 'react';
import { FieldLabel } from '../shared/FieldLabel';
import { FormError } from '../shared/FormError';
import { DURATION_OPTIONS } from '../../constants/interviewTypes';

const EMPTY_INTERVIEW = {
  companyId: '',
  type:      '',
  date:      '',
  time:      '',
  duration:  60,
  status:    'scheduled',
};

/**
 * Single-step modal for scheduling an interview.
 *
 * All fields — company, type, date, time, duration — are visible
 * immediately when the modal opens.  Validation errors appear only
 * after the first submit attempt, matching the AddCompanyModal pattern.
 *
 * @param {{
 *   companies:      Object[],
 *   interviewTypes: string[],
 *   onAdd:          (companyId: string, interview: Object) => void,
 *   onClose:        () => void,
 *   initialValues:  Object | null,
 * }} props
 */
export function AddInterviewModal({ companies, interviewTypes, onAdd, onClose, initialValues = null }) {
  const [interview, setInterview] = useState(initialValues
    ? { ...EMPTY_INTERVIEW, ...initialValues }
    : EMPTY_INTERVIEW
  );
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    companyId: !interview.companyId ? 'Please select a company'    : null,
    type:      !interview.type      ? 'Interview type is required' : null,
    date:      !interview.date      ? 'Date is required'           : null,
    time:      !interview.time      ? 'Time is required'           : null,
  };
  const isValid = !errors.companyId && !errors.type && !errors.date && !errors.time;

  function handleSubmit() {
    setSubmitted(true);
    if (!isValid) return;
    const { companyId, ...interviewData } = interview;
    onAdd(companyId, interviewData);
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function update(field, value) {
    setInterview((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
      data-testid="modal-overlay"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Schedule Interview</h3>

        <div className="space-y-4">

          {/* Company — required */}
          <div>
            <FieldLabel htmlFor="modal-company" required>Company</FieldLabel>
            <select
              id="modal-company"
              value={interview.companyId}
              onChange={(e) => update('companyId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.position}
                </option>
              ))}
            </select>
            <FormError message={submitted ? errors.companyId : null} />
          </div>

          {/* Type — required */}
          <div>
            <FieldLabel htmlFor="modal-type" required>Type</FieldLabel>
            <select
              id="modal-type"
              value={interview.type}
              onChange={(e) => update('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
            <FieldLabel htmlFor="modal-date" required>Date</FieldLabel>
            <input
              id="modal-date"
              type="date"
              value={interview.date}
              onChange={(e) => update('date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <FormError message={submitted ? errors.date : null} />
          </div>

          {/* Time — required */}
          <div>
            <FieldLabel htmlFor="modal-time" required>Time</FieldLabel>
            <input
              id="modal-time"
              type="time"
              value={interview.time}
              onChange={(e) => update('time', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <FormError message={submitted ? errors.time : null} />
          </div>

          {/* Duration — optional, defaults to 60 min */}
          <div>
            <FieldLabel htmlFor="modal-duration">Duration</FieldLabel>
            <select
              id="modal-duration"
              value={interview.duration}
              onChange={(e) => update('duration', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Schedule
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
