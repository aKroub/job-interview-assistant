import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGE_LABELS } from '../../constants/stages';
import { PIPELINES, PIPELINE_LABELS } from '../../constants/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup({ companies = [], handlers = {} } = {}) {
  const onAddCompany    = handlers.onAddCompany    ?? jest.fn();
  const onDeleteCompany = handlers.onDeleteCompany ?? jest.fn();
  const onUpdateStage   = handlers.onUpdateStage   ?? jest.fn();
  const onPipelineChange = handlers.onPipelineChange ?? jest.fn();

  render(
    <KanbanBoard
      companies={companies}
      stages={ACTIVE_STAGES}
      stageLabels={STAGE_LABELS}
      closedStage={CLOSED_STAGE}
      activePipeline="tel-aviv"
      pipelines={PIPELINES}
      pipelineLabels={PIPELINE_LABELS}
      pipelineCounts={{ 'tel-aviv': companies.length, 'us': 0 }}
      onPipelineChange={onPipelineChange}
      onAddCompany={onAddCompany}
      onDeleteCompany={onDeleteCompany}
      onUpdateStage={onUpdateStage}
    />
  );

  return { onAddCompany, onDeleteCompany, onUpdateStage, onPipelineChange };
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

  it('renders a column for every active stage', () => {
    setup();
    ACTIVE_STAGES.forEach((stage) => {
      expect(screen.getByText(STAGE_LABELS[stage])).toBeInTheDocument();
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

describe('KanbanBoard — pipeline tabs', () => {
  const user = userEvent.setup();

  it('renders a tab for each pipeline', () => {
    setup();
    expect(screen.getByText('Tel Aviv')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('calls onPipelineChange when a pipeline tab is clicked', async () => {
    const { onPipelineChange } = setup();
    await user.click(screen.getByText('US'));
    expect(onPipelineChange).toHaveBeenCalledWith('us');
  });

  it('renders pipeline counts next to labels', () => {
    const companies = [
      { id: 'c1', name: 'Google', position: 'SWE', stage: 'applied', interviews: [] },
    ];
    setup({ companies });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('KanbanBoard — interactions', () => {
  const user = userEvent.setup();

  it('calls onAddCompany when Add Company button is clicked', async () => {
    const { onAddCompany } = setup();
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAddCompany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Closed row
// ---------------------------------------------------------------------------

describe('KanbanBoard — closed row', () => {
  const user = userEvent.setup();
  it('renders the Closed row header with label and count', () => {
    const companies = [
      { id: 'c1', name: 'OldCo', position: 'SWE', stage: 'rejected', interviews: [] },
    ];
    setup({ companies });
    expect(screen.getByText(STAGE_LABELS[CLOSED_STAGE])).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('does not show closed cards when collapsed (default state)', () => {
    const companies = [
      { id: 'c1', name: 'OldCo', position: 'SWE', stage: 'rejected', interviews: [] },
    ];
    setup({ companies });
    expect(screen.queryByText('OldCo')).not.toBeInTheDocument();
  });

  it('shows closed cards after clicking the toggle button', async () => {
    const companies = [
      { id: 'c1', name: 'OldCo', position: 'SWE', stage: 'rejected', interviews: [] },
    ];
    setup({ companies });
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('OldCo')).toBeInTheDocument();
  });

  it('shows empty-state text when Closed is expanded but has no cards', async () => {
    setup();
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/no closed processes yet/i)).toBeInTheDocument();
  });

  it('hides closed cards again after re-collapsing', async () => {
    const companies = [
      { id: 'c1', name: 'OldCo', position: 'SWE', stage: 'rejected', interviews: [] },
    ];
    setup({ companies });
    const toggle = screen.getByRole('button', { expanded: false });
    await user.click(toggle);
    expect(screen.getByText('OldCo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('OldCo')).not.toBeInTheDocument();
  });

  it('renders count of zero when no closed companies exist', () => {
    setup();
    const closedButton = screen.getByRole('button', { expanded: false });
    expect(within(closedButton).getByText('(0)')).toBeInTheDocument();
  });
});
