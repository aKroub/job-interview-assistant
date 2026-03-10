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
 *   draft:          { name: string, position: string, stage: string, pipeline: string[] },
 *   onDraftChange:  (updatedDraft: Object) => void,
 *   onAdd:          () => void,
 *   onClose:        () => void,
 *   stages:         string[],
 *   stageLabels:    Object,
 *   positions:      string[],
 *   pipelines:      string[],
 *   pipelineLabels: Record<string, string>,
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
  pipelines,
  pipelineLabels,
}) {
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    name:     !draft.name.trim()                     ? 'Company name is required'          : null,
    position: !draft.position                        ? 'Please select a position'          : null,
    pipeline: !draft.pipeline || draft.pipeline.length === 0 ? 'Select at least one pipeline' : null,
  };

  const isValid = !errors.name && !errors.position && !errors.pipeline;

  function handleAdd() {
    setSubmitted(true);
    if (!isValid) return;
    onAdd();
  }

  function handleClose() {
    setSubmitted(false);
    onClose();
  }

  function handleTogglePipeline(pipelineId) {
    const current = draft.pipeline || [];
    const isSelected = current.includes(pipelineId);

    // Prevent deselecting the last pipeline
    if (isSelected && current.length <= 1) return;

    const updated = isSelected
      ? current.filter((p) => p !== pipelineId)
      : [...current, pipelineId];

    onDraftChange({ ...draft, pipeline: updated });
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-company-title"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 id="add-company-title" className="text-xl font-bold text-gray-800 mb-4">Add Company</h3>

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

          {/* Pipeline */}
          <div>
            <FieldLabel required>Pipeline</FieldLabel>
            <div className="flex gap-2" role="group" aria-label="Pipeline selection">
              {pipelines.map((p) => {
                const isSelected = (draft.pipeline || []).includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleTogglePipeline(p)}
                    aria-pressed={isSelected}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      isSelected
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pipelineLabels[p]}
                  </button>
                );
              })}
            </div>
            <FormError message={submitted ? errors.pipeline : null} />
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
