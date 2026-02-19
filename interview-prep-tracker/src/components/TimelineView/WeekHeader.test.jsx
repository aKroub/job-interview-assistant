import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekHeader } from './WeekHeader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(overrides = {}) {
  const props = {
    weekStart:  new Date(2026, 1, 15), // Sun Feb 15
    onPrevWeek: jest.fn(),
    onNextWeek: jest.fn(),
    onToday:    jest.fn(),
    onAddClick: jest.fn(),
    ...overrides,
  };

  render(<WeekHeader {...props} />);
  return props;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('WeekHeader — rendering', () => {
  it('renders the week range label', () => {
    setup();
    expect(screen.getByText('Feb 15 – Feb 21, 2026')).toBeInTheDocument();
  });

  it('renders the Today button', () => {
    setup();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders the Schedule Interview button', () => {
    setup();
    expect(screen.getByText('Schedule Interview')).toBeInTheDocument();
  });

  it('renders navigation arrows', () => {
    setup();
    expect(screen.getByLabelText('Previous week')).toBeInTheDocument();
    expect(screen.getByLabelText('Next week')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('WeekHeader — callbacks', () => {
  it('calls onPrevWeek when left arrow is clicked', () => {
    const { onPrevWeek } = setup();
    userEvent.click(screen.getByLabelText('Previous week'));
    expect(onPrevWeek).toHaveBeenCalledTimes(1);
  });

  it('calls onNextWeek when right arrow is clicked', () => {
    const { onNextWeek } = setup();
    userEvent.click(screen.getByLabelText('Next week'));
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });

  it('calls onToday when Today button is clicked', () => {
    const { onToday } = setup();
    userEvent.click(screen.getByText('Today'));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('calls onAddClick when Schedule Interview button is clicked', () => {
    const { onAddClick } = setup();
    userEvent.click(screen.getByText('Schedule Interview'));
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });
});
