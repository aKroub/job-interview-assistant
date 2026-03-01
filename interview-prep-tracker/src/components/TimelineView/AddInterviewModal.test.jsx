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

function setup({ companies, handlers = {}, initialValues = null } = {}) {
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
      initialValues={initialValues}
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

  it('does not render status dropdown in add mode', () => {
    setup();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Pre-fill via initialValues
// ---------------------------------------------------------------------------

describe('AddInterviewModal — initialValues', () => {
  it('pre-fills company, type, date, and time from initialValues', () => {
    setup({
      initialValues: {
        companyId: 'c1',
        type: INTERVIEW_TYPES[0],
        date: '2025-10-15',
        time: '09:30',
        duration: 60,
      },
    });
    expect(screen.getByLabelText(/company/i).value).toBe('c1');
    expect(screen.getByLabelText(/type/i).value).toBe(INTERVIEW_TYPES[0]);
    expect(screen.getByLabelText(/date/i).value).toBe('2025-10-15');
    expect(screen.getByLabelText(/time/i).value).toBe('09:30');
  });

  it('submits pre-filled values without additional input', () => {
    const { onAdd } = setup({
      initialValues: {
        companyId: 'c1',
        type: INTERVIEW_TYPES[0],
        date: '2025-10-15',
        time: '09:30',
        duration: 60,
      },
    });
    userEvent.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [calledCompanyId, calledInterview] = onAdd.mock.calls[0];
    expect(calledCompanyId).toBe('c1');
    expect(calledInterview.type).toBe(INTERVIEW_TYPES[0]);
    expect(calledInterview.date).toBe('2025-10-15');
    expect(calledInterview.time).toBe('09:30');
  });

  it('falls back to EMPTY_INTERVIEW when initialValues is null', () => {
    setup({ initialValues: null });
    expect(screen.getByLabelText(/company/i).value).toBe('');
    expect(screen.getByLabelText(/type/i).value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

function makeEditInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Google',
    position:    'SWE',
    type:        'Phone Interview',
    date:        '2025-10-15',
    time:        '09:30',
    duration:    60,
    status:      'scheduled',
    ...overrides,
  };
}

function setupEditMode({ interview, handlers = {} } = {}) {
  const editInterview = interview ?? makeEditInterview();
  const onEdit  = handlers.onEdit  ?? jest.fn();
  const onClose = handlers.onClose ?? jest.fn();
  const onAdd   = handlers.onAdd   ?? jest.fn();

  const companiesList = [
    makeCompany({ id: 'c1', name: 'Google', position: 'SWE' }),
    makeCompany({ id: 'c2', name: 'Meta', position: 'Staff Engineer' }),
  ];

  render(
    <AddInterviewModal
      companies={companiesList}
      interviewTypes={INTERVIEW_TYPES}
      onAdd={onAdd}
      onClose={onClose}
      interview={editInterview}
      onEdit={onEdit}
    />
  );

  return { onEdit, onClose, onAdd, editInterview };
}

describe('AddInterviewModal — edit mode rendering', () => {
  it('renders "Edit Interview" heading', () => {
    setupEditMode();
    expect(screen.getByText('Edit Interview')).toBeInTheDocument();
  });

  it('shows company as read-only text instead of dropdown', () => {
    setupEditMode();
    expect(screen.getByTestId('edit-company-display')).toHaveTextContent('Google — SWE');
    expect(screen.queryByLabelText(/company/i)).not.toBeInTheDocument();
  });

  it('shows company name without position separator when position is empty', () => {
    setupEditMode({ interview: makeEditInterview({ position: '' }) });
    expect(screen.getByTestId('edit-company-display')).toHaveTextContent('Google');
    expect(screen.getByTestId('edit-company-display').textContent).not.toContain('—');
  });

  it('pre-fills type from the interview', () => {
    setupEditMode();
    expect(screen.getByLabelText(/type/i).value).toBe('Phone Interview');
  });

  it('pre-fills date from the interview', () => {
    setupEditMode();
    expect(screen.getByLabelText(/date/i).value).toBe('2025-10-15');
  });

  it('pre-fills time from the interview', () => {
    setupEditMode();
    expect(screen.getByLabelText(/time/i).value).toBe('09:30');
  });

  it('pre-fills duration from the interview', () => {
    setupEditMode();
    expect(screen.getByLabelText(/duration/i).value).toBe('60');
  });

  it('renders the status dropdown', () => {
    setupEditMode();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it('pre-fills status from the interview', () => {
    setupEditMode({ interview: makeEditInterview({ status: 'completed' }) });
    expect(screen.getByLabelText(/status/i).value).toBe('completed');
  });

  it('shows scheduled, completed, and cancelled status options', () => {
    setupEditMode();
    const statusSelect = screen.getByLabelText(/status/i);
    const options = Array.from(statusSelect.options).map((o) => o.value);
    expect(options).toContain('scheduled');
    expect(options).toContain('completed');
    expect(options).toContain('cancelled');
  });

  it('renders "Save Changes" button instead of "Schedule"', () => {
    setupEditMode();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^schedule$/i })).not.toBeInTheDocument();
  });
});

describe('AddInterviewModal — edit mode submission', () => {
  it('calls onEdit with companyId, interviewId, and updates on save', () => {
    const { onEdit } = setupEditMode();
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    const [companyId, interviewId, updates] = onEdit.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interviewId).toBe('i1');
    expect(updates).toEqual({
      type:     'Phone Interview',
      date:     '2025-10-15',
      time:     '09:30',
      duration: 60,
      status:   'scheduled',
    });
  });

  it('does not call onAdd in edit mode', () => {
    const { onAdd } = setupEditMode();
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onClose after successful edit', () => {
    const { onClose } = setupEditMode();
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('includes updated status in the edit payload', () => {
    const { onEdit } = setupEditMode();
    userEvent.selectOptions(screen.getByLabelText(/status/i), 'completed');
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const [, , updates] = onEdit.mock.calls[0];
    expect(updates.status).toBe('completed');
  });
});

describe('AddInterviewModal — edit mode validation', () => {
  it('does not show company validation error in edit mode', () => {
    setupEditMode({ interview: makeEditInterview({ type: '', date: '', time: '' }) });
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.queryByText(/please select a company/i)).not.toBeInTheDocument();
  });

  it('shows type error in edit mode when type is cleared', () => {
    setupEditMode({ interview: makeEditInterview({ type: '' }) });
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/interview type is required/i)).toBeInTheDocument();
  });

  it('shows date error in edit mode when date is cleared', () => {
    setupEditMode({ interview: makeEditInterview({ date: '' }) });
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
  });

  it('shows time error in edit mode when time is cleared', () => {
    setupEditMode({ interview: makeEditInterview({ time: '' }) });
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/time is required/i)).toBeInTheDocument();
  });

  it('does not call onEdit when validation fails', () => {
    const { onEdit } = setupEditMode({ interview: makeEditInterview({ type: '' }) });
    userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe('AddInterviewModal — edit mode close', () => {
  it('calls onClose when Cancel is clicked in edit mode', () => {
    const { onClose } = setupEditMode();
    userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked in edit mode', () => {
    const { onClose } = setupEditMode();
    userEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
