import React from 'react';
import { CompanyCard } from './CompanyCard';

/**
 * A single pipeline stage column in the Kanban board.
 *
 * Renders all companies that belong to `stage` and delegates
 * mutations upward via callbacks.
 *
 * @param {{
 *   stage:        string,
 *   label:        string,
 *   companies:    Object[],
 *   stages:       string[],
 *   stageLabels:  Object,
 *   onDelete:     (companyId: string) => void,
 *   onUpdateStage:(companyId: string, newStage: string) => void,
 * }} props
 */
export function KanbanColumn({ stage, label, companies, stages, stageLabels, onDelete, onUpdateStage }) {
  const columnCompanies = companies.filter((c) => c.stage === stage);

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
        {label}
      </h3>
      <div className="space-y-3">
        {columnCompanies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            stages={stages}
            stageLabels={stageLabels}
            onDelete={onDelete}
            onUpdateStage={onUpdateStage}
          />
        ))}
      </div>
    </div>
  );
}
