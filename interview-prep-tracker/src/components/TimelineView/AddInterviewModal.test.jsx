import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddInterviewModal } from './AddInterviewModal';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'Acme Corp',
    position:   'Software Engineer',
    stage:      'applied',
    interviews: [],
    ...overrides,
  };
}

function setup({ companies, handlers = {} } = {}) {
  const companiesList = companies ?? [
    makeCompany({ id: 'c1', name: 'Google', position: 'SWE' }),
    makeCompany({ id: 'c2', name: 'Meta', position: 'Staff Engineer' }),
  ];
  const onAdd   = handlers.onAdd   ?? jest.fn();
  const onClose = handlers.onClose ?? jest.fn();

  render(
    <AddInterviewModal
      companies={companiesList}
      interviewTypes={INTERVIEW_TYPES}
      onAdd={onAdd}
      onClose={onClose}
    />
  );

  return { onAdd, onClose };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('AddInterviewModal — rendering', () => {
  it('renders the Schedule Interview heading', () => {
    setup();
    expect(screen.getByText('Schedule Interview')).toBeInTheDocument();
  });

  it('renders a company dropdown with all companies', () => {
    setup();
    expect(screen.getByText('Google — SWE')).toBeInTheDocument();
    expect(screen.getByText('Meta — Staff Engineer')).toBeInTheDocument();
  });

  it('renders the placeholder option', () => {
    setup();
    expect(screen.getByText('Select a company…')).toBeInTheDocument();
  });

  it('renders the Cancel button', () => {
    setup();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows the helper text when no company is selected', () => {
    setup();
    expect(screen.getByText('Select a company above to schedule an interview')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Company selection
// ---------------------------------------------------------------------------

describe('AddInterviewModal — company selection', () => {
  it('shows the Add Interview form after selecting a company', () => {
    setup();
    const companySelect = screen.getByLabelText(/company/i);
    userEvent.selectOptions(companySelect, 'c1');
    // AddInterviewForm renders an "Add Interview" button when collapsed
    expect(screen.getByText('Add Interview')).toBeInTheDocument();
  });

  it('hides the helper text after selecting a company', () => {
    setup();
    const companySelect = screen.getByLabelText(/company/i);
    userEvent.selectOptions(companySelect, 'c1');
    expect(screen.queryByText('Select a company above to schedule an interview')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Close behavior
// ---------------------------------------------------------------------------

describe('AddInterviewModal — close', () => {
  it('calls onClose when Cancel button is clicked', () => {
    const { onClose } = setup();
    userEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay background is clicked', () => {
    const { onClose } = setup();
    userEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal card is clicked', () => {
    const { onClose } = setup();
    userEvent.click(screen.getByText('Schedule Interview'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
