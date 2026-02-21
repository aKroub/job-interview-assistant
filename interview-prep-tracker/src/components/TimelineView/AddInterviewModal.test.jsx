import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddInterviewModal } from './AddInterviewModal';
import { INTERVIEW_TYPES, DURATION_OPTIONS } from '../../constants/interviewTypes';

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

/** Fills all required fields so the form is valid. */
function fillAllRequired() {
  userEvent.selectOptions(screen.getByLabelText(/company/i), 'c1');
  userEvent.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
  userEvent.type(screen.getByLabelText(/date/i), '2025-09-01');
  userEvent.type(screen.getByLabelText(/time/i), '10:00');
}

// ---------------------------------------------------------------------------
// Rendering — all fields visible immediately
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

  it('renders the company placeholder option', () => {
    setup();
    expect(screen.getByText('Select a company…')).toBeInTheDocument();
  });

  it('renders the type dropdown immediately', () => {
    setup();
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
  });

  it('renders all interview type options', () => {
    setup();
    INTERVIEW_TYPES.forEach((t) => {
      expect(screen.getByRole('option', { name: t })).toBeInTheDocument();
    });
  });

  it('renders date and time inputs immediately', () => {
    setup();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument();
  });

  it('renders the duration dropdown', () => {
    setup();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
  });

  it('renders all duration options', () => {
    setup();
    DURATION_OPTIONS.forEach((d) => {
      expect(screen.getByRole('option', { name: `${d} min` })).toBeInTheDocument();
    });
  });

  it('renders Schedule and Cancel buttons', () => {
    setup();
    expect(screen.getByRole('button', { name: /schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders exactly one Cancel button', () => {
    setup();
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    expect(cancelButtons).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Validation — errors shown only after submit attempt
// ---------------------------------------------------------------------------

describe('AddInterviewModal — validation', () => {
  function submitEmpty() {
    const result = setup();
    userEvent.click(screen.getByRole('button', { name: /schedule/i }));
    return result;
  }

  it('does not show errors before the first submit attempt', () => {
    setup();
    expect(screen.queryByText(/please select a company/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interview type is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/date is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/time is required/i)).not.toBeInTheDocument();
  });

  it('shows company error after submitting with no company', () => {
    submitEmpty();
    expect(screen.getByText(/please select a company/i)).toBeInTheDocument();
  });

  it('shows type error after submitting with no type', () => {
    submitEmpty();
    expect(screen.getByText(/interview type is required/i)).toBeInTheDocument();
  });

  it('shows date error after submitting with no date', () => {
    submitEmpty();
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
  });

  it('shows time error after submitting with no time', () => {
    submitEmpty();
    expect(screen.getByText(/time is required/i)).toBeInTheDocument();
  });

  it('does not call onAdd when fields are empty', () => {
    const { onAdd } = submitEmpty();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe('AddInterviewModal — submission', () => {
  it('calls onAdd with companyId and interview data when all required fields are filled', () => {
    const { onAdd } = setup();
    fillAllRequired();
    userEvent.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [calledCompanyId, calledInterview] = onAdd.mock.calls[0];
    expect(calledCompanyId).toBe('c1');
    expect(calledInterview.type).toBe(INTERVIEW_TYPES[0]);
    expect(calledInterview.date).toBe('2025-09-01');
    expect(calledInterview.time).toBe('10:00');
    expect(calledInterview.status).toBe('scheduled');
  });

  it('calls onClose after successful submission', () => {
    const { onClose } = setup();
    fillAllRequired();
    userEvent.click(screen.getByRole('button', { name: /schedule/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not include companyId in the interview data object', () => {
    const { onAdd } = setup();
    fillAllRequired();
    userEvent.click(screen.getByRole('button', { name: /schedule/i }));
    const [, calledInterview] = onAdd.mock.calls[0];
    expect(calledInterview).not.toHaveProperty('companyId');
  });
});

// ---------------------------------------------------------------------------
// Close behavior
// ---------------------------------------------------------------------------

describe('AddInterviewModal — close', () => {
  it('calls onClose when Cancel button is clicked', () => {
    const { onClose } = setup();
    userEvent.click(screen.getByRole('button', { name: /cancel/i }));
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
