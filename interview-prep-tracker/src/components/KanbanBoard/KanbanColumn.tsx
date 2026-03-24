import { useState } from 'react';
import { CompanyCard } from './CompanyCard.js';
import type { Company, PipelineId, StageKey } from '../../types';

interface KanbanColumnProps {
  stage: StageKey;
  label: string;
  companies: Company[];
  onDelete: (companyId: string) => void;
  onEditCompany: (company: Company) => void;
  onUpdateStage: (companyId: string, newStage: StageKey) => void;
  onDragStart: (e: React.DragEvent, companyId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  pipelineLabels: Record<PipelineId, string>;
}

/**
 * A single pipeline stage column in the Kanban board.
 *
 * Acts as a drop target for drag-and-drop stage changes.
 */
export function KanbanColumn({ stage, label, companies, onDelete, onEditCompany, onUpdateStage, onDragStart, onDragEnd, pipelineLabels }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const columnCompanies = companies.filter((c) => c.stage === stage);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if ((e.currentTarget as Node).contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
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
            onEdit={onEditCompany}
            onStageChange={onUpdateStage}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            pipelineLabels={pipelineLabels}
          />
        ))}
      </div>
    </div>
  );
}
