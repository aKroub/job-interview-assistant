import React from 'react';
import { Plus } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';

/**
 * Pipeline view rendered as a Kanban board.
 *
 * Renders one KanbanColumn per pipeline stage and an "Add Company" button.
 * All data mutations are delegated upward via callbacks — this component
 * is fully presentational.
 *
 * @param {{
 *   companies:       Object[],
 *   stages:          string[],
 *   stageLabels:     Object,
 *   onAddCompany:    () => void,
 *   onDeleteCompany: (companyId: string) => void,
 *   onUpdateStage:   (companyId: string, newStage: string) => void,
 * }} props
 */
export function KanbanBoard({ companies, stages, stageLabels, onAddCompany, onDeleteCompany, onUpdateStage }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline</h2>
        <button
          onClick={onAddCompany}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          Add Company
        </button>
      </div>

      <div className="grid grid-cols-6 gap-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={stageLabels[stage]}
            companies={companies}
            stages={stages}
            stageLabels={stageLabels}
            onDelete={onDeleteCompany}
            onUpdateStage={onUpdateStage}
          />
        ))}
      </div>
    </div>
  );
}
