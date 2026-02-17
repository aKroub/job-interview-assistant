import React from 'react';
import { Calendar, X } from 'lucide-react';

/**
 * A single company card within a Kanban column.
 *
 * Draggable — the user drags this card to a different column to change stage.
 * The stage dropdown has been removed; stage changes happen exclusively via DnD.
 *
 * @param {{
 *   company:       Object,
 *   onDelete:      (companyId: string) => void,
 *   onDragStart:   (e: DragEvent, companyId: string) => void,
 *   onDragEnd:     (e: DragEvent) => void,
 * }} props
 */
export function CompanyCard({ company, onDelete, onDragStart, onDragEnd }) {
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

      {company.interviews.length > 0 && (
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
          <Calendar size={12} />
          {company.interviews.length} interview{company.interviews.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
