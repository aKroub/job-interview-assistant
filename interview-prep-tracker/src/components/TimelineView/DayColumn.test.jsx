import React from 'react';
import { render, screen } from '@testing-library/react';
import { DayColumn } from './DayColumn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    position:    'Software Engineer',
    type:        'Phone Interview',
    date:        '2026-02-18',
    time:        '10:00',
    status:      'scheduled',
    ...overrides,
  };
}

function setup({ date, interviews = [], isToday = false, onEdit, onDeleteInterview } = {}) {
  const editHandler   = onEdit            ?? vi.fn();
  const deleteHandler = onDeleteInterview  ?? vi.fn();
  const dateObj       = date ?? new Date(2026, 1, 18); // Wednesday Feb 18

  render(
    <DayColumn
      date={dateObj}
      interviews={interviews}
      isToday={isToday}
      onDeleteInterview={deleteHandler}
      onEdit={editHandler}
    />
  );

  return { onEdit: editHandler, onDeleteInterview: deleteHandler };
}

// ---------------------------------------------------------------------------
// Day header
// ---------------------------------------------------------------------------

describe('DayColumn — header', () => {
  it('renders the formatted day header', () => {
    setup({ date: new Date(2026, 1, 18) }); // Wed 18
    expect(screen.getByText('Wed 18')).toBeInTheDocument();
  });

  it('renders a Sunday header', () => {
    setup({ date: new Date(2026, 1, 15) }); // Sun 15
    expect(screen.getByText('Sun 15')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Today highlight
// ---------------------------------------------------------------------------

describe('DayColumn — today highlight', () => {
  it('applies purple highlight classes when isToday is true', () => {
    setup({ isToday: true });
    const column = screen.getByTestId('day-column-3'); // Wednesday = 3
    expect(column.className).toContain('border-purple-400');
    expect(column.className).toContain('bg-purple-50');
  });

  it('applies default classes when isToday is false', () => {
    setup({ isToday: false });
    const column = screen.getByTestId('day-column-3');
    expect(column.className).toContain('border-gray-200');
    expect(column.className).not.toContain('border-purple-400');
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('DayColumn — empty state', () => {
  it('shows "No interviews" when no interviews are provided', () => {
    setup({ interviews: [] });
    expect(screen.getByText('No interviews')).toBeInTheDocument();
  });

  it('does not show placeholder when interviews exist', () => {
    setup({ interviews: [makeInterview()] });
    expect(screen.queryByText('No interviews')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interview cards
// ---------------------------------------------------------------------------

describe('DayColumn — interview cards', () => {
  it('renders an InterviewCard for each interview', () => {
    const interviews = [
      makeInterview({ id: 'i1', companyName: 'Google' }),
      makeInterview({ id: 'i2', companyName: 'Meta' }),
    ];
    setup({ interviews });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('renders the interview time in the card', () => {
    setup({ interviews: [makeInterview({ time: '14:30' })] });
    expect(screen.getByText('14:30')).toBeInTheDocument();
  });
});
