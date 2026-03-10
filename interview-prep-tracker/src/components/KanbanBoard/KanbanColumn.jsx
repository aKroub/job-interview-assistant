import React, { useState } from 'react';
import { CompanyCard } from './CompanyCard';

/**
 * A single pipeline stage column in the Kanban board.
 *
 * Acts as a drop target for drag-and-drop stage changes.
 * Companies are dragged from one column and dropped here to move them.
 *
 * @param {{
 *   stage:          string,
 *   label:          string,
 *   companies:      Object[],
 *   onDelete:       (companyId: string) => void,
 *   onUpdateStage:  (companyId: string, newStage: string) => void,
 *   onDragStart:    (e: DragEvent, companyId: string) => void,
 *   onDragEnd:      (e: DragEvent) => void,
 *   pipelineLabels: Record<string, string>,
 * }} props
 */
export function KanbanColumn({ stage, label, companies, onDelete, onUpdateStage, onDragStart, onDragEnd, pipelineLabels }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const columnCompanies = companies.filter((c) => c.stage === stage);

  function handleDragOver(e) {
    e.preventDefault(); // required to allow drop
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const companyId = e.dataTransfer.getData('companyId');
    if (companyId) {
      onUpdateStage(companyId, stage);
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-lg p-4 min-h-32 transition-colors ${
        isDragOver
          ? 'bg-purple-50 border-2 border-purple-400 border-dashed'
          : 'bg-gray-50 border-2 border-transparent'
      }`}
    >
      <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
        {label}
        <span className="ml-2 text-xs font-normal text-gray-400">
          ({columnCompanies.length})
        </span>
      </h3>
      <div className="space-y-3">
        {columnCompanies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            pipelineLabels={pipelineLabels}
          />
        ))}
      </div>
    </div>
  );
}
