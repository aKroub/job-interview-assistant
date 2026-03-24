// @ts-nocheck

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
  const onDelete     = handlers.onDelete     ?? vi.fn();
  const onEdit       = handlers.onEdit       ?? vi.fn();
  const onStageChange = handlers.onStageChange ?? vi.fn();
  const onDragStart  = handlers.onDragStart  ?? vi.fn();
  const onDragEnd    = handlers.onDragEnd    ?? vi.fn();

  render(
    <CompanyCard
      company={company}
      onDelete={onDelete}
      onEdit={onEdit}
      onStageChange={onStageChange}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      pipelineLabels={pipelineLabels}
    />
  );

  return { company, onDelete, onEdit, onStageChange, onDragStart, onDragEnd };
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

  it('renders an edit button with accessible label', () => {
    setup();
    expect(screen.getByRole('button', { name: /edit acme corp/i })).toBeInTheDocument();
  });

  it('does not render an edit button when onEdit is not provided', () => {
    const company = makeCompany();
    render(
      <CompanyCard
        company={company}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        pipelineLabels={PIPELINE_LABELS}
      />
    );
    expect(screen.queryByRole('button', { name: /edit acme corp/i })).not.toBeInTheDocument();
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
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
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
  const user = userEvent.setup();

  it('calls onDelete with the company id when delete button is clicked', async () => {
    window.confirm = vi.fn(() => true);
    const { onDelete } = setup();
    await user.click(screen.getByRole('button', { name: /delete acme corp/i }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('calls onEdit with the company object when edit button is clicked', async () => {
    const { onEdit, company } = setup();
    await user.click(screen.getByRole('button', { name: /edit acme corp/i }));
    expect(onEdit).toHaveBeenCalledWith(company);
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
