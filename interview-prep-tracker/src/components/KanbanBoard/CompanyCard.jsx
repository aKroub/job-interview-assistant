import React from 'react';
import { Calendar, X } from 'lucide-react';

/**
 * A single company card within a Kanban column.
 *
 * Displays the company name, position, interview count, and a stage selector.
 * All mutations are delegated upward via callbacks.
 *
 * @param {{
 *   company:         Object,
 *   stages:          string[],
 *   stageLabels:     Object,
 *   onDelete:        (companyId: string) => void,
 *   onUpdateStage:   (companyId: string, newStage: string) => void,
 * }} props
 */
export function CompanyCard({ company, stages, stageLabels, onDelete, onUpdateStage }) {
  return (
    <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
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

      {company.interviews.length > 0 && (
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
          <Calendar size={12} />
          {company.interviews.length} interview{company.interviews.length > 1 ? 's' : ''}
        </div>
      )}

      <select
        value={company.stage}
        onChange={(e) => onUpdateStage(company.id, e.target.value)}
        className="mt-2 w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={`Stage for ${company.name}`}
      >
        {stages.map((s) => (
          <option key={s} value={s}>{stageLabels[s]}</option>
        ))}
      </select>
    </div>
  );
}
