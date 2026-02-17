import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { STAGES, STAGE_LABELS } from '../../constants/stages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup({ companies = [], handlers = {} } = {}) {
  const onAddCompany    = handlers.onAddCompany    ?? jest.fn();
  const onDeleteCompany = handlers.onDeleteCompany ?? jest.fn();
  const onUpdateStage   = handlers.onUpdateStage   ?? jest.fn();

  render(
    <KanbanBoard
      companies={companies}
      stages={STAGES}
      stageLabels={STAGE_LABELS}
      onAddCompany={onAddCompany}
      onDeleteCompany={onDeleteCompany}
      onUpdateStage={onUpdateStage}
    />
  );

  return { onAddCompany, onDeleteCompany, onUpdateStage };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('KanbanBoard — rendering', () => {
  it('renders the Pipeline heading', () => {
    setup();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
  });

  it('renders an Add Company button', () => {
    setup();
    expect(screen.getByRole('button', { name: /add company/i })).toBeInTheDocument();
  });

  it('renders a column for every stage', () => {
    setup();
    // Each stage label should appear as a column heading
    Object.values(STAGE_LABELS).forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('renders companies in the correct columns', () => {
    const companies = [
      { id: 'c1', name: 'Google', position: 'SWE', stage: 'applied', interviews: [] },
      { id: 'c2', name: 'Meta',   position: 'SWE', stage: 'offer',   interviews: [] },
    ];
    setup({ companies });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('does not show the drag hint when nothing is being dragged', () => {
    setup();
    expect(screen.queryByText(/drop the card/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('KanbanBoard — interactions', () => {
  it('calls onAddCompany when Add Company button is clicked', async () => {
    const { onAddCompany } = setup();
    userEvent.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAddCompany).toHaveBeenCalledTimes(1);
  });
});
