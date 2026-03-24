/**
 * Stress tests for TodayInterviews "Join call" toggle feature.
 *
 * Hypotheses:
 *  H1: Rapid toggles across multiple chips could leave stale open panels
 *  H2: Keyboard navigation edge cases (Enter/Space on nested interactive)
 *  H3: Prop changes while panel is open (reorder, remove, type change, URL change)
 *  H4: Navigation auto-close interacts with toggle state across chips
 *  H5: Mixed interview types and edge-case data (empty URLs, long URLs, specials)
 */

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
    date: '2026-03-19',
    time: '10:00',
    status: 'scheduled',
    ...overrides,
  };
}

function makeVideoInterview(overrides: Partial<FlattenedInterview> = {}): FlattenedInterview {
  return makeInterview({
    type: 'Video Interview',
    videoCallUrl: 'https://zoom.us/j/123',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// H1: Rapid toggles across multiple chips
// ---------------------------------------------------------------------------

describe('H1: Rapid toggles across multiple video chips', () => {
  const user = userEvent.setup({ delay: null });

  it('only one panel is ever open after rapid sequential toggles across 4 chips', async () => {
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' }),
      makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' }),
      makeVideoInterview({ id: 'v3', companyName: 'Gamma', videoCallUrl: 'https://zoom.us/j/3', time: '12:00' }),
      makeVideoInterview({ id: 'v4', companyName: 'Delta', videoCallUrl: 'https://zoom.us/j/4', time: '13:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    const toggles = screen.getAllByRole('button', { name: /show.*video call link/i });
    expect(toggles).toHaveLength(4);

    await user.click(toggles[0]!);
    await user.click(toggles[1]!);
    await user.click(toggles[2]!);
    await user.click(toggles[3]!);

    const links = screen.getAllByRole('link', { name: /join.*video call/i });
    expect(links).toHaveLength(1);
    expect(links[0]!).toHaveAttribute('href', 'https://zoom.us/j/4');
  });

  it('rapid toggle-on then toggle-off on the same chip leaves panel closed', async () => {
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} />);

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide video call link/i }));
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('toggling chip A open, chip B open, chip A open again shows only A', async () => {
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' }),
      makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show beta video call link/i }));
    expect(screen.queryByRole('link', { name: /join alpha video call/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join beta video call/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /join beta video call/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H2: Keyboard navigation edge cases
// ---------------------------------------------------------------------------

describe('H2: Keyboard navigation edge cases', () => {
  const user = userEvent.setup({ delay: null });

  it('Space key on video toggle opens panel without navigating', async () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    const videoToggle = screen.getByRole('button', { name: /show.*video call link/i });
    videoToggle.focus();
    await user.keyboard(' ');

    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter on video toggle opens panel without navigating', () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    const videoToggle = screen.getByRole('button', { name: /show.*video call link/i });
    videoToggle.focus();
    fireEvent.keyDown(videoToggle, { key: 'Enter' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter on chip div (not on video toggle) still navigates', () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    const chip = screen.getByRole('button', { name: /view acme corp/i });
    fireEvent.keyDown(chip, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(interview);
  });

  it('Space key on chip div navigates', () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    const chip = screen.getByRole('button', { name: /view acme corp/i });
    fireEvent.keyDown(chip, { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Enter on chip of non-video interview still navigates normally', () => {
    const onClick = vi.fn();
    const interview = makeInterview({ id: 'p1', type: 'Phone Interview' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    const chip = screen.getByRole('button', { name: /view acme corp/i });
    fireEvent.keyDown(chip, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Tab focus targets: chip has tabIndex=0 and video toggle is a native button', () => {
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={vi.fn()} />);

    const chip = screen.getByRole('button', { name: /view acme corp/i });
    const videoToggle = screen.getByRole('button', { name: /show.*video call link/i });

    expect(chip).toHaveAttribute('tabindex', '0');
    expect(videoToggle.tagName).toBe('BUTTON');
  });
});

// ---------------------------------------------------------------------------
// H3: Prop changes while panel is open
// ---------------------------------------------------------------------------

describe('H3: Prop changes while panel is open', () => {
  const user = userEvent.setup({ delay: null });

  it('panel stays correct when interviews array is reordered during re-render', async () => {
    const interviewA = makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' });
    const interviewB = makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' });

    const { rerender } = render(
      <TodayInterviews interviews={[interviewA, interviewB]} />
    );

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();

    rerender(<TodayInterviews interviews={[interviewB, interviewA]} />);

    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /join beta video call/i })).not.toBeInTheDocument();
  });

  it('panel disappears when the open interview is removed from props', async () => {
    const interviewA = makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' });
    const interviewB = makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' });

    const { rerender } = render(
      <TodayInterviews interviews={[interviewA, interviewB]} />
    );

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();

    rerender(<TodayInterviews interviews={[interviewB]} />);

    expect(screen.queryByRole('link', { name: /join alpha video call/i })).not.toBeInTheDocument();
  });

  it('panel disappears when the open interview type changes from Video to Phone', async () => {
    const interview = makeVideoInterview({ id: 'v1', companyName: 'Alpha' });

    const { rerender } = render(
      <TodayInterviews interviews={[interview]} />
    );

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();

    const phoneInterview = { ...interview, type: 'Phone Interview' as const };
    rerender(<TodayInterviews interviews={[phoneInterview]} />);

    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('panel URL updates when the video call link changes while panel is open', async () => {
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: 'https://zoom.us/j/old' });

    const { rerender } = render(
      <TodayInterviews interviews={[interview]} />
    );

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute('href', 'https://zoom.us/j/old');

    const updated = { ...interview, videoCallUrl: 'https://teams.microsoft.com/l/new' };
    rerender(<TodayInterviews interviews={[updated]} />);

    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute('href', 'https://teams.microsoft.com/l/new');
  });

  it('panel disappears when video call link becomes invalid', async () => {
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: 'https://zoom.us/j/123' });

    const { rerender } = render(
      <TodayInterviews interviews={[interview]} />
    );

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    const invalidLink = { ...interview, videoCallUrl: 'javascript:alert(1)' };
    rerender(<TodayInterviews interviews={[invalidLink]} />);

    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H4: Navigation auto-close interactions
// ---------------------------------------------------------------------------

describe('H4: Navigation auto-close interactions', () => {
  const user = userEvent.setup({ delay: null });

  it('clicking chip area of a chip with open panel navigates AND closes panel', async () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    const chip = screen.getByRole('button', { name: /view acme corp/i });
    await user.click(chip);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('clicking a non-video chip while video panel is open closes the panel', async () => {
    const onClick = vi.fn();
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' }),
      makeInterview({ id: 'p1', companyName: 'Beta', type: 'Phone Interview', time: '11:00' }),
    ];
    render(<TodayInterviews interviews={interviews} onInterviewClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));
    expect(screen.getByRole('link', { name: /join alpha video call/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view beta/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('rapid navigation clicks across chips all close panels and fire callbacks', async () => {
    const onClick = vi.fn();
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' }),
      makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' }),
      makeVideoInterview({ id: 'v3', companyName: 'Gamma', videoCallUrl: 'https://zoom.us/j/3', time: '12:00' }),
    ];
    render(<TodayInterviews interviews={interviews} onInterviewClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /show alpha video call link/i }));

    await user.click(screen.getByRole('button', { name: /view alpha/i }));
    await user.click(screen.getByRole('button', { name: /view beta/i }));
    await user.click(screen.getByRole('button', { name: /view gamma/i }));

    expect(onClick).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('join call link click does not propagate to chip navigate', async () => {
    const onClick = vi.fn();
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));

    const link = screen.getByRole('link', { name: /join.*video call/i });
    await user.click(link);

    expect(onClick).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H5: Mixed types and edge-case data
// ---------------------------------------------------------------------------

describe('H5: Mixed types and edge-case data', () => {
  const user = userEvent.setup({ delay: null });

  it('video chip with empty string URL does not show toggle', () => {
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: '' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('video chip with undefined URL does not show toggle', () => {
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: undefined });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.queryByRole('button', { name: /video call/i })).not.toBeInTheDocument();
  });

  it('handles mix of video (with/without URL) and non-video chips correctly', async () => {
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Valid Video', videoCallUrl: 'https://zoom.us/j/1' }),
      makeVideoInterview({ id: 'v2', companyName: 'No URL Video', videoCallUrl: '', time: '11:00' }),
      makeInterview({ id: 'p1', companyName: 'Phone Co', type: 'Phone Interview', time: '12:00' }),
      makeInterview({ id: 'ip1', companyName: 'In Person Co', type: 'In-Person Interview', time: '13:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    const toggles = screen.getAllByRole('button', { name: /show.*video call link/i });
    expect(toggles).toHaveLength(1);

    await user.click(toggles[0]!);
    const link = screen.getByRole('link', { name: /join valid video video call/i });
    expect(link).toHaveAttribute('href', 'https://zoom.us/j/1');
  });

  it('handles very long URLs correctly', async () => {
    const longUrl = 'https://zoom.us/j/' + 'a'.repeat(500);
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: longUrl });
    render(<TodayInterviews interviews={[interview]} />);

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('href', longUrl);
  });

  it('handles company names with special characters in aria labels', () => {
    const interview = makeVideoInterview({
      id: 'v1',
      companyName: "O'Reilly & Sons <Corp>",
      videoCallUrl: 'https://zoom.us/j/123',
    });
    render(<TodayInterviews interviews={[interview]} onInterviewClick={vi.fn()} />);
    expect(screen.getByText("O'Reilly & Sons <Corp>")).toBeInTheDocument();
  });

  it('aria-expanded reflects panel state correctly through toggle cycle', async () => {
    const interview = makeVideoInterview({ id: 'v1', videoCallUrl: 'https://zoom.us/j/123' });
    render(<TodayInterviews interviews={[interview]} />);

    const toggle = screen.getByRole('button', { name: /show.*video call link/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    const hideToggle = screen.getByRole('button', { name: /hide video call link/i });
    expect(hideToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(hideToggle);
    const showToggle = screen.getByRole('button', { name: /show.*video call link/i });
    expect(showToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening panel on one chip updates aria-expanded on both chips correctly', async () => {
    const interviews = [
      makeVideoInterview({ id: 'v1', companyName: 'Alpha', videoCallUrl: 'https://zoom.us/j/1' }),
      makeVideoInterview({ id: 'v2', companyName: 'Beta', videoCallUrl: 'https://zoom.us/j/2', time: '11:00' }),
    ];
    render(<TodayInterviews interviews={interviews} />);

    const toggles = screen.getAllByRole('button', { name: /show.*video call link/i });
    expect(toggles[0]!).toHaveAttribute('aria-expanded', 'false');
    expect(toggles[1]!).toHaveAttribute('aria-expanded', 'false');

    // Open Alpha
    await user.click(toggles[0]!);

    // Alpha should show expanded, Beta should still show collapsed
    const hideAlpha = screen.getByRole('button', { name: /hide video call link/i });
    expect(hideAlpha).toHaveAttribute('aria-expanded', 'true');
    const showBeta = screen.getByRole('button', { name: /show beta video call link/i });
    expect(showBeta).toHaveAttribute('aria-expanded', 'false');
  });
});
