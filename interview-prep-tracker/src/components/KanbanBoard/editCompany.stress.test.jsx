/**
 * Stress tests for the edit-company feature (PR: feature/edit-company-card).
 *
 * Hypotheses tested:
 * - H1: editing a company with interviews could corrupt interview data
 * - H3: editing then cancelling could leave stale editingCompany state
 * - H4: rapid sequential edits could cause state inconsistency
 * - H5: editing a company not in the active pipeline view
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { CompanyCard } from './CompanyCard';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGE_LABELS } from '../../constants/stages';
import { PIPELINES, PIPELINE_LABELS } from '../../constants/pipelines';
import { isInPipeline } from '../../utils/companyUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'TestCo',
    position:   'Senior Software Engineer',
    stage:      'applied',
    pipeline:   ['tel-aviv'],
    interviews: [],
    notes:      '',
    createdAt:  '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setupBoard({ companies = [], handlers = {} } = {}) {
  const onAddCompany     = handlers.onAddCompany     ?? vi.fn();
  const onDeleteCompany  = handlers.onDeleteCompany  ?? vi.fn();
  const onEditCompany    = handlers.onEditCompany    ?? vi.fn();
  const onUpdateStage    = handlers.onUpdateStage    ?? vi.fn();
  const onPipelineChange = handlers.onPipelineChange ?? vi.fn();

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
      onEditCompany={onEditCompany}
      onUpdateStage={onUpdateStage}
    />
  );

  return { onAddCompany, onDeleteCompany, onEditCompany, onUpdateStage, onPipelineChange };
}

// ---------------------------------------------------------------------------
// H1: editing a company with interviews — the edit button is present and
// calls onEdit with the full company (including interviews)
// ---------------------------------------------------------------------------

describe('H1 (edit): edit button passes full company object including interviews', () => {
  const user = userEvent.setup();

  it('edit button on a company with interviews calls onEdit with the full company', async () => {
    const company = makeCompany({
      id: 'c1',
      name: 'InterviewCo',
      interviews: [
        { id: 'i1', type: 'Phone', date: '2026-04-01', time: '10:00', status: 'scheduled' },
        { id: 'i2', type: 'Technical', date: '2026-04-05', time: '14:00', status: 'completed' },
      ],
    });
    const { onEditCompany } = setupBoard({ companies: [company] });

    const editButton = screen.getByRole('button', { name: /edit interviewco/i });
    await user.click(editButton);

    expect(onEditCompany).toHaveBeenCalledTimes(1);
    const passedCompany = onEditCompany.mock.calls[0][0];
    expect(passedCompany.id).toBe('c1');
    expect(passedCompany.interviews).toHaveLength(2);
    expect(passedCompany.interviews[0].id).toBe('i1');
    expect(passedCompany.interviews[1].id).toBe('i2');
  });

  it('edit button on a company with zero interviews calls onEdit correctly', async () => {
    const company = makeCompany({ id: 'c2', name: 'EmptyCo', interviews: [] });
    const { onEditCompany } = setupBoard({ companies: [company] });

    const editButton = screen.getByRole('button', { name: /edit emptyco/i });
    await user.click(editButton);

    expect(onEditCompany).toHaveBeenCalledTimes(1);
    expect(onEditCompany.mock.calls[0][0].interviews).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H3: editing then cancelling — stale editingCompany state
// Tests that clicking edit on multiple companies calls onEdit with the correct
// company each time (no stale references)
// ---------------------------------------------------------------------------

describe('H3 (edit): clicking edit on different companies passes correct company', () => {
  const user = userEvent.setup();

  it('clicking edit on company A then B calls onEdit with B (not A)', async () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Alpha', stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'Beta', stage: 'applied' }),
    ];
    const { onEditCompany } = setupBoard({ companies });

    // Click edit on Alpha
    await user.click(screen.getByRole('button', { name: /edit alpha/i }));
    expect(onEditCompany).toHaveBeenCalledTimes(1);
    expect(onEditCompany.mock.calls[0][0].id).toBe('c1');

    // Click edit on Beta
    await user.click(screen.getByRole('button', { name: /edit beta/i }));
    expect(onEditCompany).toHaveBeenCalledTimes(2);
    expect(onEditCompany.mock.calls[1][0].id).toBe('c2');
  });

  it('clicking edit on the same company twice calls onEdit twice with same company', async () => {
    const company = makeCompany({ id: 'c1', name: 'SameCo', stage: 'applied' });
    const { onEditCompany } = setupBoard({ companies: [company] });

    await user.click(screen.getByRole('button', { name: /edit sameco/i }));
    await user.click(screen.getByRole('button', { name: /edit sameco/i }));

    expect(onEditCompany).toHaveBeenCalledTimes(2);
    expect(onEditCompany.mock.calls[0][0].id).toBe('c1');
    expect(onEditCompany.mock.calls[1][0].id).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// H4: rapid sequential edits — clicking edit on many companies rapidly
// ---------------------------------------------------------------------------

describe('H4 (edit): rapid sequential edit clicks', () => {
  const user = userEvent.setup();

  it('rapidly clicking edit on 10 different companies calls onEdit 10 times with correct IDs', async () => {
    const companies = Array.from({ length: 10 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company${i}`, stage: 'applied' })
    );
    const { onEditCompany } = setupBoard({ companies });

    for (let i = 0; i < 10; i++) {
      await user.click(screen.getByRole('button', { name: new RegExp(`edit company${i}`, 'i') }));
    }

    expect(onEditCompany).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      expect(onEditCompany.mock.calls[i][0].id).toBe(`c${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// H5: editing a company not in the active pipeline view
// ---------------------------------------------------------------------------

describe('H5 (edit): company in a non-active pipeline', () => {
  it('KanbanBoard renders all companies it receives (filtering happens upstream)', () => {
    // KanbanBoard does not filter by pipeline — InterviewPrepTracker does.
    // When activePipeline is 'tel-aviv', InterviewPrepTracker passes only
    // matching companies. Here we verify that if a US-only company is passed
    // (incorrectly or during transition), KanbanBoard still renders it.
    const company = makeCompany({ id: 'c1', name: 'UsCo', pipeline: ['us'], stage: 'applied' });
    setupBoard({ companies: [company] });

    // KanbanBoard renders whatever it receives — no internal pipeline filter
    expect(screen.getByText('UsCo')).toBeInTheDocument();
  });

  it('filtering before KanbanBoard correctly excludes non-matching pipeline companies', () => {
    // Simulate what InterviewPrepTracker does: filter companies by pipeline
    const allCompanies = [
      makeCompany({ id: 'c1', name: 'TelAvivCo', pipeline: ['tel-aviv'], stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'UsCo', pipeline: ['us'], stage: 'applied' }),
      makeCompany({ id: 'c3', name: 'BothCo', pipeline: ['tel-aviv', 'us'], stage: 'applied' }),
    ];

    const activePipeline = 'tel-aviv';
    const filtered = allCompanies.filter(c => isInPipeline(c, activePipeline));

    expect(filtered.map(c => c.name)).toEqual(['TelAvivCo', 'BothCo']);

    // Now render KanbanBoard with filtered list
    setupBoard({ companies: filtered });

    expect(screen.getByText('TelAvivCo')).toBeInTheDocument();
    expect(screen.getByText('BothCo')).toBeInTheDocument();
    expect(screen.queryByText('UsCo')).not.toBeInTheDocument();
  });

  it('multi-pipeline company appears and is editable in the active pipeline', async () => {
    const user = userEvent.setup();
    const company = makeCompany({
      id: 'c1', name: 'MultiCo', pipeline: ['tel-aviv', 'us'], stage: 'applied',
    });
    const { onEditCompany } = setupBoard({ companies: [company] });

    // Company should be visible
    expect(screen.getByText('MultiCo')).toBeInTheDocument();

    // Edit button should work
    await user.click(screen.getByRole('button', { name: /edit multico/i }));
    expect(onEditCompany).toHaveBeenCalledWith(company);
  });
});

// ---------------------------------------------------------------------------
// CompanyCard unit tests for the edit button
// ---------------------------------------------------------------------------

describe('CompanyCard edit button rendering', () => {
  const user = userEvent.setup();
  const noop = () => {};

  it('renders edit button when onEdit prop is provided', () => {
    render(
      <CompanyCard
        company={makeCompany({ name: 'EditableCo' })}
        onDelete={noop}
        onEdit={vi.fn()}
        onStageChange={noop}
        onDragStart={noop}
        onDragEnd={noop}
        pipelineLabels={PIPELINE_LABELS}
      />
    );
    expect(screen.getByRole('button', { name: /edit editableco/i })).toBeInTheDocument();
  });

  it('does not render edit button when onEdit is undefined', () => {
    render(
      <CompanyCard
        company={makeCompany({ name: 'ReadOnlyCo' })}
        onDelete={noop}
        onStageChange={noop}
        onDragStart={noop}
        onDragEnd={noop}
        pipelineLabels={PIPELINE_LABELS}
      />
    );
    expect(screen.queryByRole('button', { name: /edit readonlyco/i })).not.toBeInTheDocument();
  });

  it('edit button on closed company in expanded closed row works', async () => {
    const closedCompany = makeCompany({ id: 'c-closed', name: 'ClosedEditCo', stage: 'rejected' });
    const { onEditCompany } = setupBoard({ companies: [closedCompany] });

    // Expand closed row
    await user.click(screen.getByRole('button', { expanded: false }));

    // Edit button should be visible
    const editButton = screen.getByRole('button', { name: /edit closededitco/i });
    await user.click(editButton);

    expect(onEditCompany).toHaveBeenCalledTimes(1);
    expect(onEditCompany.mock.calls[0][0].id).toBe('c-closed');
  });
});

// ---------------------------------------------------------------------------
// Stress: edit across all stages
// ---------------------------------------------------------------------------

describe('Stress: edit button present on cards in every stage', () => {
  it('every active stage column has an edit button on its company card', () => {
    const companies = ACTIVE_STAGES.map((stage, i) =>
      makeCompany({ id: `c${i}`, name: `Co${i}`, stage })
    );
    const { onEditCompany } = setupBoard({ companies });

    ACTIVE_STAGES.forEach((_, i) => {
      const editButton = screen.getByRole('button', { name: new RegExp(`edit co${i}`, 'i') });
      expect(editButton).toBeInTheDocument();
    });
  });
});
