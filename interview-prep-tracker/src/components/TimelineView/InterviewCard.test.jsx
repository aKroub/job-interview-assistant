import React from 'react';
import { act, render, screen } from '@testing-library/react';
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

function setup(interviewOverrides = {}, handlers = {}, { highlightedInterviewId, onHighlightComplete } = {}) {
  const interview         = makeInterview(interviewOverrides);
  const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
  const onEdit            = handlers.onEdit ?? vi.fn();
  render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={onDeleteInterview}
      onEdit={onEdit}
      highlightedInterviewId={highlightedInterviewId}
      onHighlightComplete={onHighlightComplete}
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
    expect(screen.getByLabelText(/delete .+ interview/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Role / position display
// ---------------------------------------------------------------------------

describe('InterviewCard — role', () => {
  it('renders the position when present', () => {
    setup({ position: 'Senior Software Engineer' });
    expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument();
  });

  it('does not render position when absent', () => {
    setup({ position: undefined });
    expect(screen.queryByText('Senior Software Engineer')).not.toBeInTheDocument();
  });

  it('does not render position when empty string', () => {
    setup({ position: '' });
    // No empty <p> tag should appear
    const card = screen.getByText('Acme Corp').closest('div').parentElement;
    const paragraphs = card.querySelectorAll('p');
    const emptyParagraphs = [...paragraphs].filter((p) => p.textContent === '');
    expect(emptyParagraphs).toHaveLength(0);
  });

  it('truncates long position text', () => {
    setup({ position: 'Staff Software Engineer, Platform Infrastructure' });
    const el = screen.getByText('Staff Software Engineer, Platform Infrastructure');
    expect(el).toHaveClass('truncate');
  });

  it('shows full position as hover tooltip via title attribute', () => {
    setup({ position: 'Staff Software Engineer, Platform Infrastructure' });
    const el = screen.getByText('Staff Software Engineer, Platform Infrastructure');
    expect(el).toHaveAttribute('title', 'Staff Software Engineer, Platform Infrastructure');
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
  const user = userEvent.setup();

  it('calls onEdit with the interview object when clicked', async () => {
    const { interview, onEdit } = setup();
    await user.click(screen.getByLabelText(/edit acme corp interview/i));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(interview);
  });
});

// ---------------------------------------------------------------------------
// Delete button
// ---------------------------------------------------------------------------

describe('InterviewCard — delete button', () => {
  const user = userEvent.setup();

  it('calls onDeleteInterview after confirmation', async () => {
    window.confirm = vi.fn(() => true);
    const { onDeleteInterview } = setup();
    await user.click(screen.getByLabelText(/delete .+ interview/i));
    expect(onDeleteInterview).toHaveBeenCalledWith('c1', 'i1');
  });

  it('does not call onDeleteInterview when confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false);
    const { onDeleteInterview } = setup();
    await user.click(screen.getByLabelText(/delete .+ interview/i));
    expect(onDeleteInterview).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Highlight from TodayInterviews
// ---------------------------------------------------------------------------

describe('InterviewCard — highlight', () => {
  const scrollMock = vi.fn();

  beforeEach(() => {
    scrollMock.mockClear();
    Element.prototype.scrollIntoView = scrollMock;
  });

  it('applies highlight animation class when highlightedInterviewId matches', () => {
    setup({}, {}, { highlightedInterviewId: 'i1' });
    const card = screen.getByText('Acme Corp').closest('.animate-highlight-pulse');
    expect(card).toBeInTheDocument();
  });

  it('does not apply highlight class when highlightedInterviewId does not match', () => {
    setup({}, {}, { highlightedInterviewId: 'other-id' });
    const card = screen.getByText('Acme Corp').closest('.relative');
    expect(card.className).not.toContain('animate-highlight-pulse');
  });

  it('calls scrollIntoView when highlighted', () => {
    setup({}, {}, { highlightedInterviewId: 'i1' });
    expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('calls onHighlightComplete when animation ends', () => {
    const onHighlightComplete = vi.fn();
    setup({}, {}, { highlightedInterviewId: 'i1', onHighlightComplete });
    const card = screen.getByText('Acme Corp').closest('.animate-highlight-pulse');
    act(() => { card.dispatchEvent(new Event('animationend')); });
    expect(onHighlightComplete).toHaveBeenCalledTimes(1);
  });
});
