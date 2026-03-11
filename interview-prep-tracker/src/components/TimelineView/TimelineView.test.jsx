import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineView } from './TimelineView';
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
    position:   'Senior Software Engineer',
    stage:      'applied',
    interviews: [],
    ...overrides,
  };
}

function setup({ companies = [], handlers = {} } = {}) {
  const onAddInterview    = handlers.onAddInterview    ?? vi.fn();
  const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
  const onUpdateInterview = handlers.onUpdateInterview ?? vi.fn();

  render(
    <TimelineView
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
// Rendering — delegates to CalendarView
// ---------------------------------------------------------------------------

describe('TimelineView — rendering', () => {
  it('renders the Interview Calendar heading', () => {
    setup();
    expect(screen.getByText('Interview Calendar')).toBeInTheDocument();
  });

  it('renders the Schedule Interview button', () => {
    setup();
    expect(screen.getByText('Schedule Interview')).toBeInTheDocument();
  });

  it('renders 7 day columns', () => {
    setup();
    for (let i = 0; i <= 6; i++) {
      expect(screen.getByTestId(`day-column-${i}`)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TimelineView — empty state', () => {
  it('shows "No interviews" placeholder in each day when there are no interviews', () => {
    setup({ companies: [makeCompany({ interviews: [] })] });
    const placeholders = screen.getAllByText('No interviews');
    expect(placeholders.length).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Interview display
// ---------------------------------------------------------------------------

describe('TimelineView — interview display', () => {
  it('renders interview cards for companies with interviews in current week', () => {
    const today = todayDate();
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [
          { id: 'i1', type: 'Phone Interview', date: today, time: '10:00', status: 'scheduled' },
        ],
      }),
      makeCompany({
        id: 'c2',
        name: 'Meta',
        interviews: [
          { id: 'i2', type: 'Video Interview', date: today, time: '14:00', status: 'scheduled' },
        ],
      }),
    ];
    setup({ companies });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('does not show companies without interviews in the calendar', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google', interviews: [] }),
    ];
    setup({ companies });
    // Google should not appear as a company card anywhere — only "No interviews" placeholders
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Week navigation
// ---------------------------------------------------------------------------

describe('TimelineView — week navigation', () => {
  const user = userEvent.setup();

  it('changes the week label when navigating forward', async () => {
    setup();
    const weekLabel = screen.getByRole('heading', { level: 3 });
    const initial = weekLabel.textContent;

    await user.click(screen.getByLabelText('Next week'));
    expect(weekLabel.textContent).not.toBe(initial);
  });

  it('returns to current week when Today is clicked', async () => {
    setup();
    const weekLabel = screen.getByRole('heading', { level: 3 });
    const initial = weekLabel.textContent;

    await user.click(screen.getByLabelText('Next week'));
    await user.click(screen.getByText('Today'));
    expect(weekLabel.textContent).toBe(initial);
  });
});

// ---------------------------------------------------------------------------
// Add interview modal
// ---------------------------------------------------------------------------

describe('TimelineView — add interview modal', () => {
  const user = userEvent.setup();

  it('opens the modal when Schedule Interview is clicked', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    setup({ companies });

    await user.click(screen.getByText('Schedule Interview'));
    expect(screen.getByText('Select a company…')).toBeInTheDocument();
  });

  it('closes the modal when Cancel is clicked', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    setup({ companies });

    await user.click(screen.getByText('Schedule Interview'));
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Select a company…')).not.toBeInTheDocument();
  });
});
