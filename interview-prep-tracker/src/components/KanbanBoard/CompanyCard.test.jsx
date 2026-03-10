import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyCard } from './CompanyCard';
import { PIPELINE_LABELS } from '../../constants/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'Acme Corp',
    position:   'Senior Software Engineer',
    stage:      'applied',
    pipeline:   ['tel-aviv'],
    interviews: [],
    ...overrides,
  };
}

function setup(companyOverrides = {}, handlers = {}, { pipelineLabels = PIPELINE_LABELS } = {}) {
  const company      = makeCompany(companyOverrides);
  const onDelete     = handlers.onDelete     ?? jest.fn();
  const onStageChange = handlers.onStageChange ?? jest.fn();
  const onDragStart  = handlers.onDragStart  ?? jest.fn();
  const onDragEnd    = handlers.onDragEnd    ?? jest.fn();

  render(
    <CompanyCard
      company={company}
      onDelete={onDelete}
      onStageChange={onStageChange}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      pipelineLabels={pipelineLabels}
    />
  );

  return { company, onDelete, onStageChange, onDragStart, onDragEnd };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CompanyCard — rendering', () => {
  it('renders the company name', () => {
    setup();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the company position', () => {
    setup();
    expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument();
  });

  it('renders a delete button with accessible label', () => {
    setup();
    expect(screen.getByRole('button', { name: /delete acme corp/i })).toBeInTheDocument();
  });

  it('does not show the interview count when there are no interviews', () => {
    setup({ interviews: [] });
    expect(screen.queryByText(/interview/i)).not.toBeInTheDocument();
  });

  it('shows "1 interview" when there is exactly one interview', () => {
    setup({ interviews: [{ id: 'i1' }] });
    expect(screen.getByText(/1 interview/i)).toBeInTheDocument();
  });

  it('shows "2 interviews" (plural) when there are multiple interviews', () => {
    setup({ interviews: [{ id: 'i1' }, { id: 'i2' }] });
    expect(screen.getByText(/2 interviews/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Drag attributes
// ---------------------------------------------------------------------------

describe('CompanyCard — draggable', () => {
  it('the card root element has the draggable attribute', () => {
    const { container } = render(
      <CompanyCard
        company={makeCompany()}
        onDelete={jest.fn()}
        onDragStart={jest.fn()}
        onDragEnd={jest.fn()}
      />
    );
    // The outermost div should be draggable
    expect(container.firstChild).toHaveAttribute('draggable', 'true');
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('CompanyCard — callbacks', () => {
  it('calls onDelete with the company id when delete button is clicked', async () => {
    window.confirm = jest.fn(() => true);
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole('button', { name: /delete acme corp/i }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
});

// ---------------------------------------------------------------------------
// Pipeline badges
// ---------------------------------------------------------------------------

describe('CompanyCard — pipeline badges', () => {
  it('shows pipeline badges when the company belongs to multiple pipelines', () => {
    setup({ pipeline: ['tel-aviv', 'us'] });
    expect(screen.getByText('Tel Aviv')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('does not show pipeline badges for a single-pipeline company', () => {
    setup({ pipeline: ['tel-aviv'] });
    expect(screen.queryByText('Tel Aviv')).not.toBeInTheDocument();
    expect(screen.queryByText('US')).not.toBeInTheDocument();
  });

  it('does not show pipeline badges when pipelineLabels is not provided', () => {
    setup({ pipeline: ['tel-aviv', 'us'] }, {}, { pipelineLabels: null });
    expect(screen.queryByText('Tel Aviv')).not.toBeInTheDocument();
  });

  it('falls back to the raw pipeline ID when label is missing', () => {
    setup({ pipeline: ['tel-aviv', 'custom'] }, {}, { pipelineLabels: { 'tel-aviv': 'Tel Aviv' } });
    expect(screen.getByText('Tel Aviv')).toBeInTheDocument();
    expect(screen.getByText('custom')).toBeInTheDocument();
  });
});
