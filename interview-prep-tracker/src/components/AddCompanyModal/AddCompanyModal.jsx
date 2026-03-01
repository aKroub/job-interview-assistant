import React, { useState } from 'react';
import { FieldLabel } from '../shared/FieldLabel';
import { FormError } from '../shared/FormError';

/**
 * Modal dialog for adding a new company to the pipeline.
 *
 * Owns only ephemeral UI state (submitted flag for showing validation errors).
 * All persisted data and callbacks arrive via props.
 *
 * @param {{
 *   draft:         { name: string, position: string, stage: string, pipeline: string },
 *   onDraftChange: (updatedDraft: Object) => void,
 *   onAdd:         () => void,
 *   onClose:       () => void,
 *   stages:        string[],
 *   stageLabels:   Object,
 *   positions:     string[],
 *   pipelineLabel: string,
 * }} props
 */
export function AddCompanyModal({
  draft,
  onDraftChange,
  onAdd,
  onClose,
  stages,
  stageLabels,
  positions,
  pipelineLabel,
}) {
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    name:     !draft.name.trim()     ? 'Company name is required'  : null,
    position: !draft.position        ? 'Please select a position'  : null,
  };

  const isValid = !errors.name && !errors.position;

  function handleAdd() {
    setSubmitted(true);
    if (!isValid) return;
    onAdd();
  }

  function handleClose() {
    setSubmitted(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-xl font-bold text-gray-800">Add Company</h3>
          {pipelineLabel && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
              {pipelineLabel}
            </span>
          )}
        </div>

        <div className="space-y-4">

          {/* Company Name */}
          <div>
            <FieldLabel htmlFor="company-name" required>Company Name</FieldLabel>
            <input
              id="company-name"
              type="text"
              value={draft.name}
              onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Google"
              maxLength={100}
            />
            <FormError message={submitted ? errors.name : null} />
          </div>

          {/* Position */}
          <div>
            <FieldLabel htmlFor="company-position" required>Position</FieldLabel>
            <select
              id="company-position"
              value={draft.position}
              onChange={(e) => onDraftChange({ ...draft, position: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a position…</option>
              {positions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <FormError message={submitted ? errors.position : null} />
          </div>

          {/* Initial Stage */}
          <div>
            <FieldLabel htmlFor="company-stage">Initial Stage</FieldLabel>
            <select
              id="company-stage"
              value={draft.stage}
              onChange={(e) => onDraftChange({ ...draft, stage: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {stages.map((s) => (
                <option key={s} value={s}>{stageLabels[s]}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleAdd}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Add Company
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
