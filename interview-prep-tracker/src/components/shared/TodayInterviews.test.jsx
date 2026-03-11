import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayInterviews } from './TodayInterviews';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides = {}) {
  return {
    id: 'i1',
    companyId: 'c1',
    companyName: 'Acme Corp',
    position: 'Engineer',
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
    const handleClick = jest.fn();
    const interview = makeInterview({ id: 'i1', companyName: 'Google' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={handleClick} />
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(interview);
  });

  it('calls onInterviewClick on Enter keypress', () => {
    const handleClick = jest.fn();
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
      <TodayInterviews interviews={[interview]} onInterviewClick={jest.fn()} />
    );

    const chip = screen.getByRole('button');
    expect(chip).toHaveAttribute('tabindex', '0');
    expect(chip).toHaveAttribute('aria-label', 'View Google Phone Interview at 10:00');
  });

  it('does not render time or separator when interview has no time', () => {
    const interview = makeInterview({ id: 'i1', time: '' });

    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={jest.fn()} />
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

    expect(screen.queryByRole('button')).toBeNull();
  });
});
