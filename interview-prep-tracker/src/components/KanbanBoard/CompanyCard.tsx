import { Calendar, Pencil, X } from 'lucide-react';
import { isMultiPipeline } from '../../utils/companyUtils.js';
import { STAGES, STAGE_LABELS } from '../../constants/stages.js';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils.js';
import { CompanyLogo } from '../shared/CompanyLogo.js';
import type { Company, PipelineId, StageKey } from '../../types';

interface CompanyCardProps {
  company: Company;
  onDelete: (companyId: string) => void;
  onEdit?: (company: Company) => void;
  onStageChange: (companyId: string, newStage: StageKey) => void;
  onDragStart: (e: React.DragEvent, companyId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  pipelineLabels?: Record<PipelineId, string>;
}

/**
 * A single company card within a Kanban column.
 *
 * Draggable — the user drags this card to a different column to change stage.
 * A screen-reader-only select element provides an accessible keyboard
 * alternative for users who cannot drag and drop.
 */
export function CompanyCard({ company, onDelete, onEdit, onStageChange, onDragStart, onDragEnd, pipelineLabels }: CompanyCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, company.id)}
      onDragEnd={onDragEnd}
      className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-grab active:cursor-grabbing active:opacity-60"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <CompanyLogo
              logoUrl={resolveCompanyLogoUrl(company)}
              companyName={company.name}
              size={16}
            />
            <h4 className="font-semibold text-gray-800 text-sm truncate">{company.name}</h4>
          </div>
          <p className="text-xs text-gray-600 mt-1">{company.position}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {onEdit && (
            <button
              onClick={() => onEdit(company)}
              className="p-1 rounded text-gray-400 hover:text-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
              aria-label={`Edit ${company.name}`}
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(`Delete ${company.name}? This cannot be undone.`)) {
                onDelete(company.id);
              }
            }}
            className="p-1 rounded text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 transition"
            aria-label={`Delete ${company.name}`}
          >
            <X size={16} />
          </button>
        </div>
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
        onChange={(e) => onStageChange(company.id, e.target.value as StageKey)}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>
    </div>
  );
}
