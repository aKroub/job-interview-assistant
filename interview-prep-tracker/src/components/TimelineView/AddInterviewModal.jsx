import React, { useState } from 'react';
import { FieldLabel } from '../shared/FieldLabel';
import { FormError } from '../shared/FormError';
import { AddInterviewForm } from './AddInterviewForm';

/**
 * Modal overlay for scheduling an interview for any company in the pipeline.
 *
 * Provides a company selector dropdown, then renders the existing
 * AddInterviewForm once a company is selected. Follows the same modal
 * pattern as AddCompanyModal (fixed overlay + centered card).
 *
 * @param {{
 *   companies:      Object[],
 *   interviewTypes: string[],
 *   onAdd:          (companyId: string, interview: Object) => void,
 *   onClose:        () => void,
 * }} props
 */
export function AddInterviewModal({ companies, interviewTypes, onAdd, onClose }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [submitted,         setSubmitted]         = useState(false);

  const companyError = !selectedCompanyId ? 'Please select a company' : null;

  function handleAdd(companyId, interview) {
    onAdd(companyId, interview);
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
      data-testid="modal-overlay"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Schedule Interview</h3>

        {/* Company selector */}
        <div className="mb-4">
          <FieldLabel htmlFor="modal-company" required>Company</FieldLabel>
          <select
            id="modal-company"
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value);
              setSubmitted(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select a company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.position}
              </option>
            ))}
          </select>
          <FormError message={submitted ? companyError : null} />
        </div>

        {/* Interview form (shown after company is selected) */}
        {selectedCompanyId ? (
          <div className="border-t border-gray-200 pt-4">
            <AddInterviewForm
              companyId={selectedCompanyId}
              onAdd={handleAdd}
              interviewTypes={interviewTypes}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            Select a company above to schedule an interview
          </p>
        )}

        {/* Close button */}
        <div className="mt-4 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
