import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGE_LABELS } from '../../constants/stages';
import { PIPELINES, PIPELINE_LABELS } from '../../constants/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup({ companies = [], handlers = {} } = {}) {
  const onAddCompany     = handlers.onAddCompany     ?? jest.fn();
  const onDeleteCompany  = handlers.onDeleteCompany  ?? jest.fn();
  const onUpdateStage    = handlers.onUpdateStage    ?? jest.fn();
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

function makeCompany(overrides = {}) {
  return {
    id: 'c1',
    name: 'TestCo',
    position: 'SWE',
    stage: 'applied',
    interviews: [],
    ...overrides,
  };
}

/**
 * Simulates a full drag-and-drop sequence: dragStart on source → dragOver on
 * target → drop on target → dragEnd on source.
 *
 * @param {HTMLElement} source  The draggable element
 * @param {HTMLElement} target  The drop target element
 * @param {string}      companyId  The company ID carried by dataTransfer
 */
function simulateDragAndDrop(source, target, companyId) {
  const dataStore = {};

  fireEvent.dragStart(source, {
    dataTransfer: {
      setData: (key, val) => { dataStore[key] = val; },
      getData: (key) => dataStore[key] || '',
      effectAllowed: 'move',
    },
  });

  fireEvent.dragOver(target, {
    dataTransfer: {
      getData: (key) => dataStore[key] || '',
    },
  });

  fireEvent.drop(target, {
    dataTransfer: {
      getData: (key) => dataStore[key] || '',
    },
  });

  fireEvent.dragEnd(source, {
    dataTransfer: {
      getData: (key) => dataStore[key] || '',
    },
  });
}

// ---------------------------------------------------------------------------
// H1: Drag from closed row to active column
// ---------------------------------------------------------------------------

describe('H1 — drag closed company back to active column', () => {
  it('calls onUpdateStage with the active stage when a closed card is dropped on a column', async () => {
    const closedCo = makeCompany({ id: 'c-closed', name: 'ClosedCo', stage: 'rejected' });
    const { onUpdateStage } = setup({ companies: [closedCo] });

    // Expand the closed row so the card is visible
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('ClosedCo')).toBeInTheDocument();

    // Find the card and the target column (e.g., "Applied" column)
    const card = screen.getByText('ClosedCo').closest('[draggable]');
    const appliedColumn = screen.getAllByText(STAGE_LABELS.applied)[0].closest('div[class*="rounded-lg"]');

    simulateDragAndDrop(card, appliedColumn, 'c-closed');

    expect(onUpdateStage).toHaveBeenCalledWith('c-closed', 'applied');
  });

  it('calls onUpdateStage when dragging closed card to any active stage', async () => {
    const closedCo = makeCompany({ id: 'c-closed', name: 'ClosedCo', stage: 'rejected' });
    const { onUpdateStage } = setup({ companies: [closedCo] });

    await userEvent.click(screen.getByRole('button', { expanded: false }));
    const card = screen.getByText('ClosedCo').closest('[draggable]');

    // Drop onto the "Offer" column
    const offerColumn = screen.getAllByText(STAGE_LABELS.offer)[0].closest('div[class*="rounded-lg"]');
    simulateDragAndDrop(card, offerColumn, 'c-closed');

    expect(onUpdateStage).toHaveBeenCalledWith('c-closed', 'offer');
  });
});

// ---------------------------------------------------------------------------
// H2: Drag from active column to closed row
// ---------------------------------------------------------------------------

describe('H2 — drag active company to closed row', () => {
  it('calls onUpdateStage with closedStage when card is dropped on closed row', () => {
    const activeCo = makeCompany({ id: 'c-active', name: 'ActiveCo', stage: 'applied' });
    const { onUpdateStage } = setup({ companies: [activeCo] });

    const card = screen.getByText('ActiveCo').closest('[draggable]');
    const closedRow = screen.getByRole('button', { expanded: false }).closest('div[class*="rounded-lg"]');

    simulateDragAndDrop(card, closedRow, 'c-active');

    expect(onUpdateStage).toHaveBeenCalledWith('c-active', CLOSED_STAGE);
  });

  it('calls onUpdateStage even when closed row is collapsed (drop target is always active)', () => {
    const activeCo = makeCompany({ id: 'c-active', name: 'ActiveCo', stage: 'applied' });
    const { onUpdateStage } = setup({ companies: [activeCo] });

    // Don't expand the closed row — the outer div should still accept drops
    const card = screen.getByText('ActiveCo').closest('[draggable]');
    const closedRow = screen.getByRole('button', { expanded: false }).closest('div[class*="rounded-lg"]');

    simulateDragAndDrop(card, closedRow, 'c-active');

    expect(onUpdateStage).toHaveBeenCalledWith('c-active', CLOSED_STAGE);
  });
});

// ---------------------------------------------------------------------------
// H3: Drop with empty/missing companyId (guard clause)
// ---------------------------------------------------------------------------

describe('H3 — drop without companyId', () => {
  it('does not call onUpdateStage when dataTransfer has no companyId', () => {
    const activeCo = makeCompany({ id: 'c-active', name: 'ActiveCo', stage: 'applied' });
    const { onUpdateStage } = setup({ companies: [activeCo] });

    const closedRow = screen.getByRole('button', { expanded: false }).closest('div[class*="rounded-lg"]');

    // Simulate a drop without setting companyId
    fireEvent.dragOver(closedRow, {
      dataTransfer: { getData: () => '' },
    });
    fireEvent.drop(closedRow, {
      dataTransfer: { getData: () => '' },
    });

    expect(onUpdateStage).not.toHaveBeenCalled();
  });

  it('does not call onUpdateStage when dataTransfer returns undefined', () => {
    const { onUpdateStage } = setup({ companies: [] });

    const closedRow = screen.getByRole('button', { expanded: false }).closest('div[class*="rounded-lg"]');

    fireEvent.drop(closedRow, {
      dataTransfer: { getData: () => undefined },
    });

    expect(onUpdateStage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H4: Closed companies never appear in active columns
// ---------------------------------------------------------------------------

describe('H4 — active vs closed separation', () => {
  it('closed company does not appear in any active column', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'ActiveCo',  stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'ClosedCo',  stage: 'rejected' }),
    ];
    setup({ companies });

    // ActiveCo should be visible (in the applied column)
    expect(screen.getByText('ActiveCo')).toBeInTheDocument();

    // ClosedCo should NOT be visible (closed row is collapsed)
    expect(screen.queryByText('ClosedCo')).not.toBeInTheDocument();
  });

  it('after expanding, closed company appears only in the closed row', async () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'ActiveCo',  stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'ClosedCo',  stage: 'rejected' }),
    ];
    setup({ companies });

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    // Both visible now
    expect(screen.getByText('ActiveCo')).toBeInTheDocument();
    expect(screen.getByText('ClosedCo')).toBeInTheDocument();

    // ClosedCo should be inside the closed-companies region, not in any KanbanColumn
    const closedRegion = document.getElementById('closed-companies');
    expect(within(closedRegion).getByText('ClosedCo')).toBeInTheDocument();

    // ActiveCo should NOT be in the closed region
    expect(within(closedRegion).queryByText('ActiveCo')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H5: Company with unknown stage (corrupted / future data)
// ---------------------------------------------------------------------------

describe('H5 — company with unknown stage', () => {
  it('company with unrecognized stage is not shown in active columns or closed row', async () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'NormalCo', stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'GhostCo',  stage: 'unknown-future-stage' }),
    ];
    setup({ companies });

    // NormalCo is visible
    expect(screen.getByText('NormalCo')).toBeInTheDocument();

    // GhostCo is not visible (not in any active column)
    expect(screen.queryByText('GhostCo')).not.toBeInTheDocument();

    // Expand closed row — GhostCo should NOT appear there either
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByText('GhostCo')).not.toBeInTheDocument();
  });

  it('company with undefined stage is treated as neither active nor closed', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'NullStageCo', stage: undefined }),
    ];
    setup({ companies });

    // Should not crash and should not appear in active columns
    expect(screen.queryByText('NullStageCo')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Stress: many companies across all stages
// ---------------------------------------------------------------------------

describe('Stress — large dataset', () => {
  it('handles 100 companies across all stages without errors', async () => {
    const allStages = [...ACTIVE_STAGES, CLOSED_STAGE];
    const companies = Array.from({ length: 100 }, (_, i) => ({
      id: `c${i}`,
      name: `Company${i}`,
      position: 'SWE',
      stage: allStages[i % allStages.length],
      interviews: [],
    }));
    setup({ companies });

    // Active columns should render without error
    ACTIVE_STAGES.forEach((stage) => {
      expect(screen.getAllByText(STAGE_LABELS[stage]).length).toBeGreaterThan(0);
    });

    // Expand closed row
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    // Count closed companies: 100 / 7 stages → ~14 closed
    const closedRegion = document.getElementById('closed-companies');
    const closedCards = within(closedRegion).getAllByText(/^Company\d+$/);
    const expectedClosed = companies.filter((c) => c.stage === CLOSED_STAGE).length;
    expect(closedCards).toHaveLength(expectedClosed);
  });

  it('renders correct count badge for closed row with many companies', () => {
    const companies = Array.from({ length: 50 }, (_, i) => ({
      id: `c${i}`,
      name: `Co${i}`,
      position: 'SWE',
      stage: 'rejected',
      interviews: [],
    }));
    setup({ companies });

    const closedButton = screen.getByRole('button', { expanded: false });
    expect(within(closedButton).getByText('(50)')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Stress: rapid toggle
// ---------------------------------------------------------------------------

describe('Stress — rapid toggle', () => {
  it('survives 20 rapid expand/collapse cycles without crashing', async () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'ToggleCo', stage: 'rejected' }),
    ];
    setup({ companies });

    for (let i = 0; i < 20; i++) {
      const isExpanded = i % 2 === 1;
      const toggle = screen.getByRole('button', { expanded: isExpanded });
      await userEvent.click(toggle);
    }

    // After 20 clicks (even number), should be back to collapsed
    expect(screen.queryByText('ToggleCo')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Stress: delete from closed row
// ---------------------------------------------------------------------------

describe('Stress — delete closed company', () => {
  it('calls onDeleteCompany when delete button is clicked on a closed card', async () => {
    const companies = [
      makeCompany({ id: 'c-del', name: 'DeleteMe', stage: 'rejected' }),
    ];
    const { onDeleteCompany } = setup({ companies });

    // Expand closed row
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    // Click the delete button on the card
    const deleteButton = screen.getByRole('button', { name: /delete deleteme/i });
    await userEvent.click(deleteButton);

    expect(onDeleteCompany).toHaveBeenCalledWith('c-del');
  });
});
