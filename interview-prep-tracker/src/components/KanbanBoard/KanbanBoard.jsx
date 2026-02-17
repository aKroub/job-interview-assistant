import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';

/**
 * Pipeline view rendered as a Kanban board with drag-and-drop stage movement.
 *
 * Owns the ephemeral drag state (which company is being dragged).
 * Dropping a card on a column calls onUpdateStage to persist the new stage.
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
  const [draggingId, setDraggingId] = useState(null);

  function handleDragStart(e, companyId) {
    setDraggingId(companyId);
    e.dataTransfer.setData('companyId', companyId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

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

      {draggingId && (
        <p className="text-xs text-blue-600 text-center animate-pulse">
          Drop the card on any column to move it
        </p>
      )}

      <div className="grid grid-cols-6 gap-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={stageLabels[stage]}
            companies={companies}
            onDelete={onDeleteCompany}
            onUpdateStage={onUpdateStage}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
