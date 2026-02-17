import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyCard } from './CompanyCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'Acme Corp',
    position:   'Senior Software Engineer',
    stage:      'applied',
    interviews: [],
    ...overrides,
  };
}

function setup(companyOverrides = {}, handlers = {}) {
  const company    = makeCompany(companyOverrides);
  const onDelete   = handlers.onDelete   ?? jest.fn();
  const onDragStart = handlers.onDragStart ?? jest.fn();
  const onDragEnd  = handlers.onDragEnd  ?? jest.fn();

  render(
    <CompanyCard
      company={company}
      onDelete={onDelete}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );

  return { company, onDelete, onDragStart, onDragEnd };
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
    const { onDelete } = setup();
    userEvent.click(screen.getByRole('button', { name: /delete acme corp/i }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
});
