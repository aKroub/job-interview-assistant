import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from './CalendarView';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';
import { toDateString } from '../../utils/calendarUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as a YYYY-MM-DD string so interviews appear in the current week. */
function todayDate() {
  return toDateString(new Date());
}

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'Acme Corp',
    position:   'Software Engineer',
    stage:      'applied',
    interviews: [],
    ...overrides,
  };
}

function makeInterview(overrides = {}) {
  return {
    id:     'i1',
    type:   'Phone Interview',
    date:   todayDate(),
    time:   '10:00',
    status: 'scheduled',
    ...overrides,
  };
}

function setup({ companies = [], handlers = {} } = {}) {
  const onAddInterview    = handlers.onAddInterview    ?? jest.fn();
  const onDeleteInterview = handlers.onDeleteInterview ?? jest.fn();
  const onUpdateInterview = handlers.onUpdateInterview ?? jest.fn();

  render(
    <CalendarView
      companies={companies}
      interviewTypes={INTERVIEW_TYPES}
      onAddInterview={onAddInterview}
      onDeleteInterview={onDeleteInterview}
      onUpdateInterview={onUpdateInterview}
    />
  );

  return { onAddInterview, onDeleteInterview, onUpdateInterview };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CalendarView — rendering', () => {
  it('renders the Interview Calendar heading', () => {
    setup();
    expect(screen.getByText('Interview Calendar')).toBeInTheDocument();
  });

  it('renders 7 day columns', () => {
    setup();
    // Each day column has a data-testid like "day-column-0" through "day-column-6"
    for (let i = 0; i <= 6; i++) {
      expect(screen.getByTestId(`day-column-${i}`)).toBeInTheDocument();
    }
  });

  it('renders the Schedule Interview button in the header', () => {
    setup();
    expect(screen.getByText('Schedule Interview')).toBeInTheDocument();
  });

  it('renders the Today button', () => {
    setup();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interview display
// ---------------------------------------------------------------------------

describe('CalendarView — interview display', () => {
  it('shows interviews in the calendar for the current week', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', time: '10:00' })],
      }),
    ];
    setup({ companies });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('shows empty placeholders for days without interviews', () => {
    setup({ companies: [] });
    const placeholders = screen.getAllByText('No interviews');
    expect(placeholders.length).toBe(7); // all 7 days empty
  });
});

// ---------------------------------------------------------------------------
// Week navigation
// ---------------------------------------------------------------------------

describe('CalendarView — week navigation', () => {
  const user = userEvent.setup();

  it('navigates to previous week when left arrow is clicked', async () => {
    setup();
    const weekLabel = screen.getByRole('heading', { level: 3 });
    const initialText = weekLabel.textContent;

    await user.click(screen.getByLabelText('Previous week'));
    expect(weekLabel.textContent).not.toBe(initialText);
  });

  it('navigates to next week when right arrow is clicked', async () => {
    setup();
    const weekLabel = screen.getByRole('heading', { level: 3 });
    const initialText = weekLabel.textContent;

    await user.click(screen.getByLabelText('Next week'));
    expect(weekLabel.textContent).not.toBe(initialText);
  });

  it('returns to current week when Today is clicked after navigating', async () => {
    setup();
    const weekLabel = screen.getByRole('heading', { level: 3 });
    const initialText = weekLabel.textContent;

    // Navigate away
    await user.click(screen.getByLabelText('Next week'));
    expect(weekLabel.textContent).not.toBe(initialText);

    // Come back
    await user.click(screen.getByText('Today'));
    expect(weekLabel.textContent).toBe(initialText);
  });
});

// ---------------------------------------------------------------------------
// Add interview modal
// ---------------------------------------------------------------------------

describe('CalendarView — add interview modal', () => {
  const user = userEvent.setup();

  it('opens the modal when Schedule Interview is clicked', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    setup({ companies });

    await user.click(screen.getByText('Schedule Interview'));
    // Modal should show the "Schedule Interview" heading (inside modal)
    // and the company dropdown
    expect(screen.getByText('Select a company…')).toBeInTheDocument();
  });

  it('closes the modal when Cancel is clicked', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    setup({ companies });

    await user.click(screen.getByText('Schedule Interview'));
    expect(screen.getByText('Select a company…')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Select a company…')).not.toBeInTheDocument();
  });
});
