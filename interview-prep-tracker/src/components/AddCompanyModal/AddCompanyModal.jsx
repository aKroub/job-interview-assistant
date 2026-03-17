import React, { useState, useEffect, useRef } from 'react';
import { FieldLabel } from '../shared/FieldLabel';
import { FormError } from '../shared/FormError';
import { CompanyCombobox } from '../shared/CompanyCombobox';

/**
 * Modal dialog for adding a new company or editing an existing one.
 *
 * Owns only ephemeral UI state (submitted flag for showing validation errors).
 * All persisted data and callbacks arrive via props.
 *
 * When `editingCompany` is provided, the modal switches to edit mode:
 * the title changes to "Edit Company", the company name field is disabled,
 * and the submit button reads "Save Changes".
 *
 * @param {{
 *   draft:            { name: string, position: string, stage: string, pipeline: string[], domain?: string, customLogoUrl?: string },
 *   onDraftChange:    (updatedDraft: Object) => void,
 *   onAdd:            () => void,
 *   onClose:          () => void,
 *   stages:           string[],
 *   stageLabels:      Object,
 *   positions:        string[],
 *   pipelines:        string[],
 *   pipelineLabels:   Record<string, string>,
 *   editingCompany?:  Object | null,
 *   onEdit?:          () => void,
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
  editingCompany = null,
  onEdit,
}) {
  const isEditMode = !!editingCompany;
  const [submitted, setSubmitted] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const selector = 'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = modal.querySelector(selector);
    if (firstFocusable) firstFocusable.focus();

    function handleTab(e) {
      if (e.key !== 'Tab') return;
      const focusables = [...modal.querySelectorAll(selector)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, []);

  const errors = {
    name:     !draft.name.trim()                     ? 'Company name is required'          : null,
    position: !draft.position                        ? 'Please select a position'          : null,
    pipeline: !draft.pipeline || draft.pipeline.length === 0 ? 'Select at least one pipeline' : null,
  };

  const isValid = !errors.name && !errors.position && !errors.pipeline;

  function handleSubmit() {
    setSubmitted(true);
    if (!isValid) return;
    if (isEditMode) {
      onEdit();
    } else {
      onAdd();
    }
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

  function handleCompanyNameChange(name) {
    onDraftChange({ ...draft, name, domain: undefined, customLogoUrl: undefined });
  }

  function handleCustomCompany(info) {
    onDraftChange({
      ...draft,
      name: info.name,
      domain: info.domain || undefined,
      customLogoUrl: info.customLogoUrl || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-company-title"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div ref={modalRef} className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 id="add-company-title" className="text-xl font-bold text-gray-800 mb-4">
          {isEditMode ? 'Edit Company' : 'Add Company'}
        </h3>

        <div className="space-y-4">

          {/* Company Name — searchable combobox (disabled in edit mode) */}
          <div>
            <FieldLabel htmlFor="company-combobox" required>Company Name</FieldLabel>
            {isEditMode ? (
              <input
                id="company-combobox"
                type="text"
                value={draft.name}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            ) : (
              <CompanyCombobox
                value={draft.name}
                onChange={handleCompanyNameChange}
                onCustomCompany={handleCustomCompany}
              />
            )}
            <FormError message={submitted ? errors.name : null} />
          </div>

          {/* Position */}
          <div>
            <FieldLabel htmlFor="company-position" required>Position</FieldLabel>
            <select
              id="company-position"
              value={draft.position}
              onChange={(e) => onDraftChange({ ...draft, position: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {stages.map((s) => (
                <option key={s} value={s}>{stageLabels[s]}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            {isEditMode ? 'Save Changes' : 'Add Company'}
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
