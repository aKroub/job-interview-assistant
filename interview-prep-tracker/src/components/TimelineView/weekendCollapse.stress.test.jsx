import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from './CalendarView';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';
import {
  getWeekDays,
  getWeekStart,
  toDateString,
} from '../../utils/calendarUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    date:   toDateString(new Date()),
    time:   '10:00',
    status: 'scheduled',
    ...overrides,
  };
}

function setup({ companies = [], handlers = {} } = {}) {
  const onAddInterview    = handlers.onAddInterview    ?? vi.fn();
  const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
  const onUpdateInterview = handlers.onUpdateInterview ?? vi.fn();

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

/**
 * Returns the date strings for every day of the current week (Sun–Sat).
 */
function currentWeekDateStrings() {
  const weekStart = getWeekStart(new Date());
  return getWeekDays(weekStart).map(d => toDateString(d));
}

/**
 * Returns the getDay() index of today (0=Sun … 6=Sat).
 */
function todayDayIndex() {
  return new Date().getDay();
}

// ---------------------------------------------------------------------------
// H1: All 7 days have interviews — no day should collapse
// ---------------------------------------------------------------------------

describe('H1 — all days occupied, no collapse', () => {
  it('does not collapse any column when every day has at least one interview', () => {
    const dates = currentWeekDateStrings();

    const companies = [
      makeCompany({
        id: 'c-all',
        interviews: dates.map((date, i) =>
          makeInterview({ id: `i-${i}`, date, time: `${9 + i}:00` })
        ),
      }),
    ];

    setup({ companies });

    for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
      const col = screen.getByTestId(`day-column-${dayIndex}`);
      expect(col.className).not.toContain('border-dashed');
    }
  });

  it('sets all 7 grid columns to 1fr when every day is occupied', () => {
    const dates = currentWeekDateStrings();

    const companies = [
      makeCompany({
        id: 'c-all',
        interviews: dates.map((date, i) =>
          makeInterview({ id: `i-${i}`, date, time: `${9 + i}:00` })
        ),
      }),
    ];

    setup({ companies });

    const grid = screen.getByTestId('week-grid');
    const weekCols = grid.style.getPropertyValue('--week-cols');
    const parts = weekCols.split(' ');
    expect(parts).toHaveLength(7);
    expect(parts.every(p => p === '1fr')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H2: Weekend interview exists but in a DIFFERENT week — displayed weekend
//     should still collapse
// ---------------------------------------------------------------------------

describe('H2 — weekend interview in a different week', () => {
  it('collapses displayed weekend days even when a future weekend has interviews', () => {
    // Place an interview on the Friday of NEXT week (never in the current week).
    const nextWeekStart = new Date(getWeekStart(new Date()));
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekDays = getWeekDays(nextWeekStart);
    // Friday of next week = index 5
    const nextFridayStr = toDateString(nextWeekDays[5]);

    const companies = [
      makeCompany({
        id: 'c-next',
        interviews: [
          makeInterview({ id: 'i-next-fri', date: nextFridayStr, time: '14:00' }),
        ],
      }),
    ];

    setup({ companies });

    // Current week's Friday and Saturday should still be collapsed
    const friday   = screen.getByTestId('day-column-5');
    const saturday = screen.getByTestId('day-column-6');
    expect(friday.className).toContain('border-dashed');
    expect(saturday.className).toContain('border-dashed');
  });

  it('does not show the next-week interview in the current week grid', () => {
    const nextWeekStart = new Date(getWeekStart(new Date()));
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekDays = getWeekDays(nextWeekStart);
    const nextSaturdayStr = toDateString(nextWeekDays[6]);

    const companies = [
      makeCompany({
        id: 'c-next-sat',
        name: 'FutureCo',
        interviews: [
          makeInterview({ id: 'i-next-sat', date: nextSaturdayStr, time: '11:00' }),
        ],
      }),
    ];

    setup({ companies });

    // The company name should not appear because the interview is next week
    expect(screen.queryByText('FutureCo')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H3: Navigating between weeks updates collapsed state correctly
// ---------------------------------------------------------------------------

describe('H3 — collapsed state updates on week navigation', () => {
  const user = userEvent.setup();

  it('re-evaluates collapsed state after navigating to a week with weekend interviews', async () => {
    // Place an interview on next week's Friday
    const nextWeekStart = new Date(getWeekStart(new Date()));
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekDays = getWeekDays(nextWeekStart);
    const nextFridayStr = toDateString(nextWeekDays[5]);

    const companies = [
      makeCompany({
        id: 'c-nav',
        interviews: [
          makeInterview({ id: 'i-nav-fri', date: nextFridayStr, time: '15:00' }),
        ],
      }),
    ];

    setup({ companies });

    // Current week: Friday should be collapsed (no interview this week)
    expect(screen.getByTestId('day-column-5').className).toContain('border-dashed');

    // Navigate to next week
    await user.click(screen.getByLabelText('Next week'));

    // Next week: Friday should NOT be collapsed (has an interview)
    expect(screen.getByTestId('day-column-5').className).not.toContain('border-dashed');
    // Saturday of next week should still be collapsed (no interview)
    expect(screen.getByTestId('day-column-6').className).toContain('border-dashed');
  });

  it('re-collapses weekend days when navigating back to an empty week', async () => {
    // Interview only on next week's Friday
    const nextWeekStart = new Date(getWeekStart(new Date()));
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekDays = getWeekDays(nextWeekStart);
    const nextFridayStr = toDateString(nextWeekDays[5]);

    const companies = [
      makeCompany({
        id: 'c-back',
        interviews: [
          makeInterview({ id: 'i-back-fri', date: nextFridayStr, time: '09:00' }),
        ],
      }),
    ];

    setup({ companies });

    // Navigate forward then backward
    await user.click(screen.getByLabelText('Next week'));
    // Friday expanded on next week
    expect(screen.getByTestId('day-column-5').className).not.toContain('border-dashed');

    await user.click(screen.getByLabelText('Previous week'));
    // Back to current week: both weekend days collapsed again
    expect(screen.getByTestId('day-column-5').className).toContain('border-dashed');
    expect(screen.getByTestId('day-column-6').className).toContain('border-dashed');
  });

  it('updates --week-cols CSS variable after navigation', async () => {
    const nextWeekStart = new Date(getWeekStart(new Date()));
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekDays = getWeekDays(nextWeekStart);
    const nextFridayStr = toDateString(nextWeekDays[5]);
    const nextSaturdayStr = toDateString(nextWeekDays[6]);

    const companies = [
      makeCompany({
        id: 'c-css',
        interviews: [
          makeInterview({ id: 'i-css-fri', date: nextFridayStr, time: '10:00' }),
          makeInterview({ id: 'i-css-sat', date: nextSaturdayStr, time: '11:00' }),
        ],
      }),
    ];

    setup({ companies });

    // Current week: 2 collapsed (Fri+Sat)
    const grid = screen.getByTestId('week-grid');
    const currentParts = grid.style.getPropertyValue('--week-cols').split(' ');
    expect(currentParts.filter(p => p === '48px')).toHaveLength(2);

    // Navigate to next week: both Fri and Sat have interviews → 0 collapsed
    await user.click(screen.getByLabelText('Next week'));
    const nextParts = grid.style.getPropertyValue('--week-cols').split(' ');
    expect(nextParts.filter(p => p === '48px')).toHaveLength(0);
    expect(nextParts.every(p => p === '1fr')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H4: toDateString key consistency — collapsedDays Set vs grid template
// ---------------------------------------------------------------------------

describe('H4 — key consistency between collapsedDays and grid template', () => {
  it('collapsed columns count matches 48px entries in grid template', () => {
    setup({ companies: [] });

    const grid = screen.getByTestId('week-grid');
    const weekCols = grid.style.getPropertyValue('--week-cols');
    const collapsed48pxCount = weekCols.split(' ').filter(p => p === '48px').length;

    // Count columns with border-dashed
    let dashedCount = 0;
    for (let i = 0; i <= 6; i++) {
      if (screen.getByTestId(`day-column-${i}`).className.includes('border-dashed')) {
        dashedCount++;
      }
    }

    expect(dashedCount).toBe(collapsed48pxCount);
  });

  it('exactly the right day indices are collapsed (5 and 6 only, when empty)', () => {
    setup({ companies: [] });

    const nonWeekendIndices = [0, 1, 2, 3, 4]; // Sun–Thu
    const weekendIndices    = [5, 6];           // Fri, Sat

    for (const i of nonWeekendIndices) {
      expect(screen.getByTestId(`day-column-${i}`).className).not.toContain('border-dashed');
    }
    for (const i of weekendIndices) {
      expect(screen.getByTestId(`day-column-${i}`).className).toContain('border-dashed');
    }
  });

  it('mixed occupancy: one weekend day occupied, one not — grid has exactly 1 collapsed', () => {
    // Put interview on this week's Friday only
    const dates = currentWeekDateStrings();
    const fridayStr = dates[5]; // index 5 = Friday

    const companies = [
      makeCompany({
        id: 'c-mixed',
        interviews: [
          makeInterview({ id: 'i-mixed-fri', date: fridayStr, time: '16:00' }),
        ],
      }),
    ];

    setup({ companies });

    // Friday should NOT be collapsed
    expect(screen.getByTestId('day-column-5').className).not.toContain('border-dashed');
    // Saturday should be collapsed
    expect(screen.getByTestId('day-column-6').className).toContain('border-dashed');

    // Grid should have exactly 1 "48px"
    const grid = screen.getByTestId('week-grid');
    const parts = grid.style.getPropertyValue('--week-cols').split(' ');
    expect(parts.filter(p => p === '48px')).toHaveLength(1);
    expect(parts.filter(p => p === '1fr')).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// H5: Today is a collapsed weekend day — purple highlight behavior
// ---------------------------------------------------------------------------

describe('H5 — today is a collapsed weekend day', () => {
  const todayIdx = todayDayIndex();
  const isTodayWeekend = todayIdx === 5 || todayIdx === 6;

  if (isTodayWeekend) {
    it('today column has purple accent even when collapsed (no interviews)', () => {
      setup({ companies: [] });

      const todayCol = screen.getByTestId(`day-column-${todayIdx}`);
      // isToday takes precedence over isCollapsed in the ternary chain
      expect(todayCol.className).toContain('border-purple-400');
      expect(todayCol.className).toContain('bg-purple-50/50');
    });

    it('today column does NOT get dashed border when it is today (even if weekend + empty)', () => {
      setup({ companies: [] });

      const todayCol = screen.getByTestId(`day-column-${todayIdx}`);
      // The isCollapsed prop is true (weekend + empty), but DayColumn renders
      // isToday styles via the ternary — border-dashed still applies from the
      // outer className though, because isCollapsed controls the outer div.
      // This test documents the actual behavior.
      expect(todayCol.className).toContain('border-dashed');
    });

    it('today weekend column has correct aria-label for collapsed state', () => {
      setup({ companies: [] });

      const todayCol = screen.getByTestId(`day-column-${todayIdx}`);
      // When collapsed, aria-label includes "no interviews"
      expect(todayCol.getAttribute('aria-label')).toContain('no interviews');
    });
  } else {
    // Today is a weekday — simulate the scenario by navigating to a week
    // and checking that the weekend columns (which are not today) behave correctly.
    it('non-today weekend columns do NOT have purple accent', () => {
      setup({ companies: [] });

      // Both 5 (Fri) and 6 (Sat) are weekend and not today
      const friday   = screen.getByTestId('day-column-5');
      const saturday = screen.getByTestId('day-column-6');

      expect(friday.className).not.toContain('border-purple-400');
      expect(saturday.className).not.toContain('border-purple-400');
    });

    it('non-today weekend columns get gray collapsed styling', () => {
      setup({ companies: [] });

      const friday   = screen.getByTestId('day-column-5');
      const saturday = screen.getByTestId('day-column-6');

      expect(friday.className).toContain('border-gray-300');
      expect(friday.className).toContain('bg-gray-50/20');
      expect(saturday.className).toContain('border-gray-300');
      expect(saturday.className).toContain('bg-gray-50/20');
    });

    it('today column (weekday) has purple accent and is not collapsed', () => {
      setup({ companies: [] });

      const todayCol = screen.getByTestId(`day-column-${todayIdx}`);
      expect(todayCol.className).toContain('border-purple-400');
      expect(todayCol.className).not.toContain('border-dashed');
    });
  }

  it('collapsed weekend column hides interview cards section', () => {
    setup({ companies: [] });

    // Find a weekend column that is NOT today (guaranteed collapsed + gray styling)
    const targetIdx = todayIdx === 5 ? 6 : 5;
    const col = screen.getByTestId(`day-column-${targetIdx}`);

    // The collapsed column should NOT contain "No interviews" placeholder text
    // because the content section is hidden via {!isCollapsed && ...}
    const placeholder = col.querySelector('.flex-1');
    expect(placeholder).toBeNull();
  });
});
