import React from 'react';
import { Calendar, X } from 'lucide-react';
import { isMultiPipeline } from '../../utils/companyUtils';
import { STAGES, STAGE_LABELS } from '../../constants/stages';

/**
 * A single company card within a Kanban column.
 *
 * Draggable — the user drags this card to a different column to change stage.
 * A screen-reader-only select element provides an accessible keyboard
 * alternative for users who cannot drag and drop.
 *
 * When a company belongs to multiple pipelines, small pipeline badges are shown
 * beneath the position text so the user can see at a glance where else this
 * company appears.
 *
 * @param {{
 *   company:        Object,
 *   onDelete:       (companyId: string) => void,
 *   onStageChange:  (companyId: string, newStage: string) => void,
 *   onDragStart:    (e: DragEvent, companyId: string) => void,
 *   onDragEnd:      (e: DragEvent) => void,
 *   pipelineLabels: Record<string, string>,
 * }} props
 */
export function CompanyCard({ company, onDelete, onStageChange, onDragStart, onDragEnd, pipelineLabels }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, company.id)}
      onDragEnd={onDragEnd}
      className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-grab active:cursor-grabbing active:opacity-60"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-800 text-sm">{company.name}</h4>
          <p className="text-xs text-gray-600 mt-1">{company.position}</p>
        </div>
        <button
          onClick={() => onDelete(company.id)}
          className="text-gray-400 hover:text-red-600 transition"
          aria-label={`Delete ${company.name}`}
        >
          <X size={16} />
        </button>
      </div>

      {pipelineLabels && isMultiPipeline(company) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {company.pipeline.map((p) => (
            <span
              key={p}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600"
            >
              {pipelineLabels[p] || p}
            </span>
          ))}
        </div>
      )}

      {company.interviews.length > 0 && (
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
          <Calendar size={12} />
          {company.interviews.length} interview{company.interviews.length > 1 ? 's' : ''}
        </div>
      )}

      {/* Accessible keyboard alternative to drag-and-drop */}
      <label className="sr-only" htmlFor={`stage-select-${company.id}`}>
        Move {company.name} to stage
      </label>
      <select
        id={`stage-select-${company.id}`}
        className="sr-only"
        value={company.stage}
        onChange={(e) => onStageChange(company.id, e.target.value)}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>
    </div>
  );
}
