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
  const interview         = makeInterview(interviewOverrides);
  const onDeleteInterview = handlers.onDeleteInterview ?? jest.fn();
  const onEdit            = handlers.onEdit ?? jest.fn();
  render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={onDeleteInterview}
      onEdit={onEdit}
    />
  );
  return { interview, onDeleteInterview, onEdit };
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

  it('renders the edit button', () => {
    setup();
    expect(screen.getByLabelText(/edit acme corp interview/i)).toBeInTheDocument();
  });

  it('renders the delete button', () => {
    setup();
    expect(screen.getByLabelText(/delete interview/i)).toBeInTheDocument();
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
// Edit button
// ---------------------------------------------------------------------------

describe('InterviewCard — edit button', () => {
  it('calls onEdit with the interview object when clicked', () => {
    const { interview, onEdit } = setup();
    userEvent.click(screen.getByLabelText(/edit acme corp interview/i));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(interview);
  });
});

// ---------------------------------------------------------------------------
// Delete button
// ---------------------------------------------------------------------------

describe('InterviewCard — delete button', () => {
  it('calls onDeleteInterview after confirmation', () => {
    window.confirm = jest.fn(() => true);
    const { onDeleteInterview } = setup();
    userEvent.click(screen.getByLabelText(/delete interview/i));
    expect(onDeleteInterview).toHaveBeenCalledWith('c1', 'i1');
  });

  it('does not call onDeleteInterview when confirmation is cancelled', () => {
    window.confirm = jest.fn(() => false);
    const { onDeleteInterview } = setup();
    userEvent.click(screen.getByLabelText(/delete interview/i));
    expect(onDeleteInterview).not.toHaveBeenCalled();
  });
});
