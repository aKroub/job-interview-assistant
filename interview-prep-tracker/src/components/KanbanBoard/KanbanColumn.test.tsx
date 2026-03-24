// @ts-nocheck

import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanColumn } from './KanbanColumn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return { id: 'c1', name: 'Acme', position: 'Eng', stage: 'applied', interviews: [], ...overrides };
}

function setup({ stage = 'applied', label = 'Applied', companies = [], handlers = {} } = {}) {
  const onDelete      = handlers.onDelete      ?? vi.fn();
  const onUpdateStage = handlers.onUpdateStage ?? vi.fn();
  const onDragStart   = handlers.onDragStart   ?? vi.fn();
  const onDragEnd     = handlers.onDragEnd     ?? vi.fn();

  const { container } = render(
    <KanbanColumn
      stage={stage}
      label={label}
      companies={companies}
      onDelete={onDelete}
      onUpdateStage={onUpdateStage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );

  return { container, onDelete, onUpdateStage, onDragStart, onDragEnd };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('KanbanColumn — rendering', () => {
  it('renders the column label', () => {
    setup({ label: 'Applied' });
    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  it('shows the company count', () => {
    const companies = [makeCompany({ stage: 'applied' })];
    setup({ companies });
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows zero count when no companies match this stage', () => {
    const companies = [makeCompany({ stage: 'offer' })];
    setup({ stage: 'applied', companies });
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('only renders cards belonging to this stage', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Acme', stage: 'applied' }),
      makeCompany({ id: 'c2', name: 'Other', stage: 'offer' }),
    ];
    setup({ stage: 'applied', companies });
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop: drop handler calls onUpdateStage
// ---------------------------------------------------------------------------

describe('KanbanColumn — drag and drop', () => {
  it('calls onUpdateStage with the dropped companyId and this column stage on drop', () => {
    const { container, onUpdateStage } = setup({ stage: 'technical' });
    const col = container.firstChild;

    // Simulate dragOver (allows drop)
    fireEvent.dragOver(col, { preventDefault: vi.fn() });

    // Simulate drop with companyId data
    fireEvent.drop(col, {
      dataTransfer: { getData: (key) => (key === 'companyId' ? 'c1' : '') },
    });

    expect(onUpdateStage).toHaveBeenCalledWith('c1', 'technical');
  });

  it('does not call onUpdateStage when no companyId is present on drop', () => {
    const { container, onUpdateStage } = setup({ stage: 'applied' });
    const col = container.firstChild;

    fireEvent.drop(col, {
      dataTransfer: { getData: () => '' },
    });

    expect(onUpdateStage).not.toHaveBeenCalled();
  });
});
