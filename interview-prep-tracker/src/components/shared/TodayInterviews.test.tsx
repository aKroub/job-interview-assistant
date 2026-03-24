// @ts-nocheck
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayInterviews } from './TodayInterviews';
import type { FlattenedInterview } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides: Partial<FlattenedInterview> = {}): FlattenedInterview {
  return {
    id: 'i1',
    companyId: 'c1',
    companyName: 'Acme Corp',
    position: 'Engineer',
    companyDomain: null,
    companyCustomLogoUrl: null,
    type: 'Phone Interview',
    date: '2026-03-11',
    time: '10:00',
    status: 'scheduled',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TodayInterviews', () => {
  const user = userEvent.setup();

  it('returns null when interviews array is empty', () => {
    const { container } = render(<TodayInterviews interviews={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the header with correct count', () => {
    const interviews = [
      makeInterview({ id: 'i1' }),
      makeInterview({ id: 'i2', companyName: 'Beta Inc', time: '14:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    expect(screen.getByText("Today's Interviews")).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders each interview time', () => {
    const interviews = [
      makeInterview({ id: 'i1', time: '09:00' }),
      makeInterview({ id: 'i2', companyName: 'Beta Inc', time: '14:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
  });

  it('renders each interview company name', () => {
    const interviews = [
      makeInterview({ id: 'i1', companyName: 'Acme Corp' }),
      makeInterview({ id: 'i2', companyName: 'Beta Inc', time: '14:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Interactivity (onInterviewClick provided)
  // ---------------------------------------------------------------------------

  it('calls onInterviewClick with the interview when a chip is clicked', async () => {
    const handleClick = vi.fn();
    const interview = makeInterview({ id: 'i1', companyName: 'Google' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={handleClick} />
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(interview);
  });

  it('calls onInterviewClick on Enter keypress', () => {
    const handleClick = vi.fn();
    const interview = makeInterview({ id: 'i1' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={handleClick} />
    );

    const chip = screen.getByRole('button');
    fireEvent.keyDown(chip, { key: 'Enter' });

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(interview);
  });

  it('chips have role="button", tabIndex=0, and aria-label when clickable', () => {
    const interview = makeInterview({ id: 'i1', companyName: 'Google', type: 'Phone Interview', time: '10:00' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={vi.fn()} />
    );

    const chip = screen.getByRole('button');
    expect(chip).toHaveAttribute('tabindex', '0');
    expect(chip).toHaveAttribute('aria-label', 'View Google Phone Interview at 10:00');
  });

  it('does not render time or separator when interview has no time', () => {
    const interview = makeInterview({ id: 'i1', time: '' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={vi.fn()} />
    );

    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'View Acme Corp Phone Interview at TBD'
    );
  });

  it('renders the region landmark with aria-label', () => {
    const interview = makeInterview({ id: 'i1' });

    render(<TodayInterviews interviews={[interview]} />);

    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      "Today's upcoming interviews"
    );
  });

  // ---------------------------------------------------------------------------
  // Non-interactive mode (onInterviewClick not provided)
  // ---------------------------------------------------------------------------

  it('chips do not have role="button" when onInterviewClick is not provided', () => {
    const interview = makeInterview({ id: 'i1' });

    render(<TodayInterviews interviews={[interview]} />);

    // No chip-level buttons (video icon toggle is not a chip button)
    expect(screen.queryByRole('button', { name: /view/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Video call link toggle on today chips
// ---------------------------------------------------------------------------

describe('TodayInterviews — video call link', () => {
  const user = userEvent.setup();

  it('renders a clickable video icon for Video Interview with a valid URL', () => {
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
  });

  it('does not render clickable video icon for Phone Interview even with a URL', () => {
    const interview = makeInterview({ type: 'Phone Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('does not render clickable video icon for Video Interview without a URL', () => {
    const interview = makeInterview({ type: 'Video Interview' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('shows "Join call" link when video icon is clicked', async () => {
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('href', 'https://zoom.us/j/123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('hides "Join call" link when video icon is clicked again', async () => {
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hide video call link/i }));
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does not navigate to timeline when video icon is clicked', async () => {
    const onInterviewClick = vi.fn();
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onInterviewClick} />);
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(onInterviewClick).not.toHaveBeenCalled();
  });

  it('does not show an edit input (read-only join call)', async () => {
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('closes open join call panel when a chip is clicked to navigate', async () => {
    const onInterviewClick = vi.fn();
    const interviews = [
      makeInterview({ id: 'i1', type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' }),
      makeInterview({ id: 'i2', companyName: 'Beta Inc', type: 'Phone Interview', time: '14:00' }),
    ];
    render(<TodayInterviews interviews={interviews} onInterviewClick={onInterviewClick} />);

    // Open join call on first chip
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    // Click second chip to navigate — join call should close
    const betaChip = screen.getByRole('button', { name: /view beta inc/i });
    await user.click(betaChip);
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('only one join call panel can be open at a time', async () => {
    const interviews = [
      makeInterview({ id: 'i1', companyName: 'Acme Corp', type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/111' }),
      makeInterview({ id: 'i2', companyName: 'Beta Inc', type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/222', time: '14:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    // Open first chip's panel
    const toggles = screen.getAllByRole('button', { name: /show.*video call link/i });
    await user.click(toggles[0]!);
    expect(screen.getByRole('link', { name: /join acme corp video call/i })).toBeInTheDocument();

    // Open second chip's panel — first should auto-close
    await user.click(screen.getByRole('button', { name: /show beta inc video call link/i }));
    expect(screen.queryByRole('link', { name: /join acme corp video call/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join beta inc video call/i })).toBeInTheDocument();
  });

  it('pressing Enter on video toggle does not trigger chip navigate (nested interactive guard)', async () => {
    const onInterviewClick = vi.fn();
    const interview = makeInterview({ type: 'Video Interview', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onInterviewClick} />);

    const videoToggle = screen.getByRole('button', { name: /show.*video call link/i });
    videoToggle.focus();
    fireEvent.keyDown(videoToggle, { key: 'Enter' });
    // The video toggle's native click fires, but the chip's navigate handler must NOT fire.
    expect(onInterviewClick).not.toHaveBeenCalled();
  });
});
