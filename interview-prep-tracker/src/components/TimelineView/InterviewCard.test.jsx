import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewCard } from './InterviewCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    position:    'Senior Software Engineer',
    type:        'Phone Interview',
    date:        '2099-06-01',
    time:        '10:00',
    status:      'scheduled',
    ...overrides,
  };
}

function setup(interviewOverrides = {}, handlers = {}) {
  const interview      = makeInterview(interviewOverrides);
  const onUpdateStatus = handlers.onUpdateStatus ?? jest.fn();
  render(<InterviewCard interview={interview} onUpdateStatus={onUpdateStatus} />);
  return { interview, onUpdateStatus };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('InterviewCard — rendering', () => {
  it('renders the interview time', () => {
    setup();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('renders the company name', () => {
    setup();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the interview type', () => {
    setup();
    expect(screen.getByText('Phone Interview')).toBeInTheDocument();
  });

  it('renders the pencil edit button by default', () => {
    setup();
    expect(screen.getByLabelText(/edit status/i)).toBeInTheDocument();
  });

  it('does not show the status dropdown by default', () => {
    setup();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Duration display
// ---------------------------------------------------------------------------

describe('InterviewCard — duration', () => {
  it('renders duration when present', () => {
    setup({ duration: 60 });
    expect(screen.getByText('(60 min)')).toBeInTheDocument();
  });

  it('renders different duration values', () => {
    setup({ duration: 90 });
    expect(screen.getByText('(90 min)')).toBeInTheDocument();
  });

  it('does not render duration when absent', () => {
    setup();
    expect(screen.queryByText(/min\)/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Derived display status badge
// ---------------------------------------------------------------------------

describe('InterviewCard — derived status badge', () => {
  it('shows "scheduled" badge for a future interview', () => {
    setup({ date: '2099-01-01', time: '10:00', status: 'scheduled' });
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('shows "passed" badge for a past scheduled interview', () => {
    setup({ date: '2000-01-01', time: '10:00', status: 'scheduled' });
    expect(screen.getByText('passed')).toBeInTheDocument();
  });

  it('shows "completed" badge regardless of date', () => {
    setup({ date: '2099-01-01', status: 'completed' });
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows "cancelled" badge regardless of date', () => {
    setup({ date: '2099-01-01', status: 'cancelled' });
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pencil edit — status dropdown
// ---------------------------------------------------------------------------

describe('InterviewCard — pencil edit', () => {
  it('clicking pencil reveals the status dropdown', () => {
    setup();
    userEvent.click(screen.getByLabelText(/edit status/i));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('dropdown value reflects the persisted status', () => {
    setup({ status: 'completed' });
    userEvent.click(screen.getByLabelText(/edit status/i));
    expect(screen.getByRole('combobox').value).toBe('completed');
  });

  it('shows scheduled, completed, and cancelled options', () => {
    setup();
    userEvent.click(screen.getByLabelText(/edit status/i));
    const options = screen.getAllByRole('option').map((o) => o.value);
    expect(options).toContain('scheduled');
    expect(options).toContain('completed');
    expect(options).toContain('cancelled');
  });

  it('calls onUpdateStatus and hides dropdown on change', () => {
    const { onUpdateStatus } = setup({ status: 'scheduled' });
    userEvent.click(screen.getByLabelText(/edit status/i));
    userEvent.selectOptions(screen.getByRole('combobox'), 'completed');
    expect(onUpdateStatus).toHaveBeenCalledWith('c1', 'i1', 'completed');
    // Dropdown should be hidden again after selection
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
