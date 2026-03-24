// @ts-nocheck
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
  const interview           = makeInterview(interviewOverrides);
  const onDeleteInterview   = handlers.onDeleteInterview ?? vi.fn();
  const onEdit              = handlers.onEdit ?? vi.fn();
  const onUpdateInterview   = handlers.onUpdateInterview ?? vi.fn();
  render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={onDeleteInterview}
      onEdit={onEdit}
      onUpdateInterview={onUpdateInterview}
      highlightedInterviewId={highlightedInterviewId}
      onHighlightComplete={onHighlightComplete}
    />
  );
  return { interview, onDeleteInterview, onEdit, onUpdateInterview };
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
    expect(screen.getByText(/·\s*1 hr/)).toBeInTheDocument();
  });

  it('renders different duration values', () => {
    setup({ duration: 90 });
    expect(screen.getByText(/·\s*90 min/)).toBeInTheDocument();
  });

  it('renders full-day duration label for 480 minutes', () => {
    setup({ duration: 480 });
    expect(screen.getByText(/·\s*Full day \(8 hrs\)/)).toBeInTheDocument();
  });

  it('does not render duration when absent', () => {
    setup();
    expect(screen.queryByText(/·\s*\d+\s*min/)).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Video call link
// ---------------------------------------------------------------------------

describe('InterviewCard — video call link (toggle panel)', () => {
  const user = userEvent.setup();

  it('renders a toggle button for Video Interview with a valid URL', () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    const toggle = screen.getByRole('button', { name: /show.*video call link/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a toggle button for Video Interview even without a URL (to add one)', () => {
    setup({ type: 'Video Interview' });
    const toggle = screen.getByRole('button', { name: /add.*video call link/i });
    expect(toggle).toBeInTheDocument();
  });

  it('does not show the URL link initially', () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('reveals the Join call link and an input when the video icon is clicked', async () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://zoom.us/j/123');
    expect(screen.getByLabelText(/video call url/i)).toBeInTheDocument();
  });

  it('hides the panel when the video icon is clicked again', async () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hide video call panel/i }));
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('opens the revealed link in a new tab with security attributes', async () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://meet.google.com/abc-defg-hij' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('does not render toggle for non-Video Interview types even with a URL', () => {
    setup({ type: 'Phone Interview', videoCallUrl: 'https://zoom.us/j/123' });
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('does not render toggle for In-Person Interview type even with a URL', () => {
    setup({ type: 'In-Person Interview', videoCallUrl: 'https://zoom.us/j/123' });
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('shows "Join call" label with full URL in title tooltip', async () => {
    setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveTextContent('Join call');
    expect(link).toHaveAttribute('title', 'https://zoom.us/j/123');
  });

  it('saves a new URL via inline input and onUpdateInterview', async () => {
    const { onUpdateInterview } = setup({ type: 'Video Interview' });
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.type(input, 'https://zoom.us/j/new');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallUrl: 'https://zoom.us/j/new' });
  });

  it('cancels editing without saving', async () => {
    const { onUpdateInterview } = setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));
    expect(onUpdateInterview).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/video call url/i)).not.toBeInTheDocument();
  });

  it('shows validation error for URL without https:// protocol', async () => {
    const { onUpdateInterview } = setup({ type: 'Video Interview' });
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.type(input, 'zoom.us/j/123');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('URL must start with https://');
    expect(onUpdateInterview).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears validation error when user edits the input', async () => {
    const { onUpdateInterview } = setup({ type: 'Video Interview' });
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.type(input, 'zoom.us/j/123');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(input, 'https://zoom.us/j/123');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows saving an empty URL to clear the link', async () => {
    const { onUpdateInterview } = setup({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallUrl: '' });
  });
});
