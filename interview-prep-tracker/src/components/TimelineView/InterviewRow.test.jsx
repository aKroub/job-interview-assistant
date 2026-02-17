import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewRow } from './InterviewRow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds an interview already decorated with companyName / position / companyId
 * (as flattenAndSortInterviews would add them).
 */
function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    position:    'Senior Software Engineer',
    type:        'Phone Interview',
    date:        '2025-06-01',
    time:        '10:00',
    status:      'scheduled',
    ...overrides,
  };
}

function setup(interviewOverrides = {}, handlers = {}) {
  const interview      = makeInterview(interviewOverrides);
  const onUpdateStatus = handlers.onUpdateStatus ?? jest.fn();
  render(<InterviewRow interview={interview} onUpdateStatus={onUpdateStatus} />);
  return { interview, onUpdateStatus };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('InterviewRow — rendering', () => {
  it('renders the company name', () => {
    setup();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the position', () => {
    setup();
    expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument();
  });

  it('renders the interview type', () => {
    setup();
    expect(screen.getByText('Phone Interview')).toBeInTheDocument();
  });

  it('renders the manual status dropdown', () => {
    setup();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Derived display status badge
// ---------------------------------------------------------------------------

describe('InterviewRow — derived status badge', () => {
  it('shows "scheduled" badge for a future interview with status scheduled', () => {
    // Date far in the future → always future
    setup({ date: '2099-01-01', time: '10:00', status: 'scheduled' });
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('shows "passed" badge for a past interview with status scheduled', () => {
    // Date far in the past → always past
    setup({ date: '2000-01-01', time: '10:00', status: 'scheduled' });
    expect(screen.getByText('passed')).toBeInTheDocument();
  });

  it('shows "completed" badge when status is completed regardless of date', () => {
    setup({ date: '2099-01-01', status: 'completed' });
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows "cancelled" badge when status is cancelled regardless of date', () => {
    setup({ date: '2099-01-01', status: 'cancelled' });
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Manual status dropdown
// ---------------------------------------------------------------------------

describe('InterviewRow — status dropdown', () => {
  it('dropdown value reflects the persisted status', () => {
    setup({ status: 'completed' });
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('completed');
  });

  it('dropdown shows scheduled, completed, and cancelled options', () => {
    setup();
    const options = screen.getAllByRole('option').map((o) => o.value);
    expect(options).toContain('scheduled');
    expect(options).toContain('completed');
    expect(options).toContain('cancelled');
  });

  it('calls onUpdateStatus with companyId, interviewId, and new status on change', async () => {
    const { onUpdateStatus } = setup({ status: 'scheduled' });
    userEvent.selectOptions(screen.getByRole('combobox'), 'completed');
    expect(onUpdateStatus).toHaveBeenCalledWith('c1', 'i1', 'completed');
  });
});
