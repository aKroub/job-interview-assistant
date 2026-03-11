/**
 * Stress tests for TodayInterviews component (PR: feature/today-interviews).
 *
 * Covers edge cases around:
 *  - H10: Unrecognised interview type (not in TYPE_CONFIG)
 *  - Large number of interviews (50+) rendering without crash
 *  - Interviews with missing/empty fields
 *  - Click handler correctness with many items
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
// H10: Unrecognised interview type not in TYPE_CONFIG
// ---------------------------------------------------------------------------

describe('H10: unrecognised interview type', () => {
  it('renders without crashing when type is not in TYPE_CONFIG', () => {
    const interview = makeInterview({
      id: 'i1',
      type: 'Whiteboard Challenge',
    });
    const { container } = render(
      <TodayInterviews interviews={[interview]} />
    );
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders without crashing when type is an empty string', () => {
    const interview = makeInterview({ id: 'i1', type: '' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders without crashing when type is undefined', () => {
    const interview = makeInterview({ id: 'i1', type: undefined });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders without crashing when type is null', () => {
    const interview = makeInterview({ id: 'i1', type: null });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('mixes recognised and unrecognised types without error', () => {
    const interviews = [
      makeInterview({ id: 'i1', type: 'Phone Interview', companyName: 'Alpha' }),
      makeInterview({ id: 'i2', type: 'Unknown Type', companyName: 'Beta' }),
      makeInterview({ id: 'i3', type: 'Video Interview', companyName: 'Gamma' }),
      makeInterview({ id: 'i4', type: '', companyName: 'Delta' }),
      makeInterview({ id: 'i5', type: 'In-Person Interview', companyName: 'Epsilon' }),
    ];
    render(<TodayInterviews interviews={interviews} />);
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Delta')).toBeInTheDocument();
    expect(screen.getByText('Epsilon')).toBeInTheDocument();
  });

  it('click handler works with unrecognised type', () => {
    const handleClick = jest.fn();
    const interview = makeInterview({ id: 'i1', type: 'Alien Probe Interview' });
    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={handleClick} />
    );
    userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(interview);
  });

  it('aria-label includes unrecognised type string', () => {
    const interview = makeInterview({
      id: 'i1',
      companyName: 'TestCo',
      type: 'Take Home Assignment',
      time: '15:00',
    });
    render(
      <TodayInterviews interviews={[interview]} onInterviewClick={jest.fn()} />
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'View TestCo Take Home Assignment at 15:00'
    );
  });
});

// ---------------------------------------------------------------------------
// Large dataset rendering (50+ interviews)
// ---------------------------------------------------------------------------

describe('Large dataset rendering', () => {
  it('renders 50 interviews without crashing', () => {
    const interviews = [];
    for (let i = 0; i < 50; i++) {
      interviews.push(
        makeInterview({
          id: `i${i}`,
          companyName: `Company ${i}`,
          time: `${String(9 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`,
        })
      );
    }
    render(<TodayInterviews interviews={interviews} />);
    expect(screen.getByText('(50)')).toBeInTheDocument();
  });

  it('renders 100 interviews and count is correct', () => {
    const interviews = [];
    for (let i = 0; i < 100; i++) {
      interviews.push(
        makeInterview({
          id: `i${i}`,
          companyName: `Corp ${i}`,
          time: `${String(8 + Math.floor(i / 10)).padStart(2, '0')}:${String((i % 10) * 5).padStart(2, '0')}`,
        })
      );
    }
    render(<TodayInterviews interviews={interviews} />);
    expect(screen.getByText('(100)')).toBeInTheDocument();
  });

  it('clicking the correct chip in a large list calls back with the right interview', () => {
    const handleClick = jest.fn();
    const interviews = [];
    for (let i = 0; i < 30; i++) {
      interviews.push(
        makeInterview({
          id: `i${i}`,
          companyName: `Company ${i}`,
          time: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
        })
      );
    }
    render(
      <TodayInterviews interviews={interviews} onInterviewClick={handleClick} />
    );

    // Click on the chip for Company 15 specifically
    const target = screen.getByText('Company 15');
    userEvent.click(target.closest('[role="button"]'));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'i15', companyName: 'Company 15' })
    );
  });
});

// ---------------------------------------------------------------------------
// Missing/edge-case field values
// ---------------------------------------------------------------------------

describe('Missing and edge-case field values', () => {
  it('renders interview with no time (empty string) — shows company but no time element', () => {
    const interview = makeInterview({ id: 'i1', time: '' });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    // No time digits should appear
    expect(screen.queryByText(/^\d{2}:\d{2}$/)).toBeNull();
  });

  it('renders interview with no time (undefined) — shows company but no time element', () => {
    const interview = makeInterview({ id: 'i1', time: undefined });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders interview with very long company name — truncated via CSS', () => {
    const longName = 'A'.repeat(200);
    const interview = makeInterview({ id: 'i1', companyName: longName });
    render(<TodayInterviews interviews={[interview]} />);
    // The name should appear in the DOM (CSS handles truncation)
    const nameEl = screen.getByText(longName);
    expect(nameEl).toBeInTheDocument();
    expect(nameEl).toHaveAttribute('title', longName);
  });

  it('renders interview with special characters in company name', () => {
    const specialName = 'O\'Brien & Müller "Tech" <Corp>';
    const interview = makeInterview({ id: 'i1', companyName: specialName });
    render(<TodayInterviews interviews={[interview]} />);
    expect(screen.getByText(specialName)).toBeInTheDocument();
  });

  it('handles duplicate interview IDs gracefully (React key warning but no crash)', () => {
    // This tests a data integrity edge case — duplicate IDs
    const interviews = [
      makeInterview({ id: 'dup', companyName: 'First', time: '09:00' }),
      makeInterview({ id: 'dup', companyName: 'Second', time: '10:00' }),
    ];
    // Should render without throwing — React may warn about duplicate keys
    // but should not crash
    expect(() => {
      render(<TodayInterviews interviews={interviews} />);
    }).not.toThrow();
  });
});
