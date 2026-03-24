import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn.js';
import { CompanyCard } from './CompanyCard.js';
import type { ActiveStageKey, Company, PipelineId, StageKey } from '../../types';

interface KanbanBoardProps {
  companies: Company[];
  stages: ActiveStageKey[];
  stageLabels: Record<StageKey, string>;
  closedStage: StageKey;
  activePipeline: PipelineId;
  pipelines: PipelineId[];
  pipelineLabels: Record<PipelineId, string>;
  pipelineCounts: Record<PipelineId, number>;
  onPipelineChange: (pipeline: PipelineId) => void;
  onAddCompany: () => void;
  onDeleteCompany: (companyId: string) => void;
  onEditCompany: (company: Company) => void;
  onUpdateStage: (companyId: string, newStage: StageKey) => void;
}

/**
 * Pipeline view rendered as a Kanban board with drag-and-drop stage movement.
 *
 * Active stages render as a 6-column grid (left-to-right progression).
 * The closed stage renders as a separate collapsible row below.
 */
export function KanbanBoard({
  companies, stages, stageLabels, closedStage,
  activePipeline, pipelines, pipelineLabels, pipelineCounts, onPipelineChange,
  onAddCompany, onDeleteCompany, onEditCompany, onUpdateStage,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [isClosedDragOver, setIsClosedDragOver] = useState(false);

  const activeCompanies = companies.filter((c) => c.stage !== closedStage);
  const closedCompanies = companies.filter((c) => c.stage === closedStage);

  function handleDragStart(e: React.DragEvent, companyId: string) {
    setDraggingId(companyId);
    e.dataTransfer.setData('companyId', companyId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingId(null);
    setIsClosedDragOver(false);
  }

  function handleClosedDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!isClosedDragOver) setIsClosedDragOver(true);
  }

  function handleClosedDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      setIsClosedDragOver(false);
    }
  }

  function handleClosedDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsClosedDragOver(false);
    const companyId = e.dataTransfer.getData('companyId');
    if (companyId) {
      onUpdateStage(companyId, closedStage);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline</h2>
        <div className="flex items-center gap-2">
          {pipelines.map((p) => (
            <button
              key={p}
              onClick={() => onPipelineChange(p)}
              aria-pressed={p === activePipeline}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                p === activePipeline
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {pipelineLabels[p]}
              <span className={`ml-1.5 text-xs ${
                p === activePipeline ? 'text-purple-200' : 'text-gray-400'
              }`}>
                {pipelineCounts[p] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={onAddCompany}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
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

      {/* Active stages grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={stageLabels[stage]}
            companies={activeCompanies}
            onDelete={onDeleteCompany}
            onEditCompany={onEditCompany}
            onUpdateStage={onUpdateStage}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            pipelineLabels={pipelineLabels}
          />
        ))}
      </div>

      {/* Closed row — collapsible bottom section */}
      <div
        onDragOver={handleClosedDragOver}
        onDragLeave={handleClosedDragLeave}
        onDrop={handleClosedDrop}
        className={`rounded-lg p-4 transition-colors ${
          isClosedDragOver
            ? 'bg-purple-50 border-2 border-purple-400 border-dashed'
            : 'bg-gray-100 border-2 border-transparent'
        }`}
      >
        <button
          onClick={() => setClosedExpanded((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
          aria-expanded={closedExpanded}
          aria-controls="closed-companies"
        >
          <Archive size={16} className="text-gray-500" aria-hidden="true" />
          <span className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
            {stageLabels[closedStage]}
          </span>
          <span className="text-xs text-gray-400">
            ({closedCompanies.length})
          </span>
          {closedExpanded
            ? <ChevronDown size={16} className="text-gray-400 ml-auto" aria-hidden="true" />
            : <ChevronRight size={16} className="text-gray-400 ml-auto" aria-hidden="true" />
          }
        </button>

        {closedExpanded && (
          <div id="closed-companies" className="flex flex-wrap gap-3 mt-3">
            {closedCompanies.length === 0 && (
              <p className="text-sm text-gray-400 italic">No closed processes yet</p>
            )}
            {closedCompanies.map((company) => (
              <div key={company.id} className="w-48">
                <CompanyCard
                  company={company}
                  onDelete={onDeleteCompany}
                  onEdit={onEditCompany}
                  onStageChange={onUpdateStage}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  pipelineLabels={pipelineLabels}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
