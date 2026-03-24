// @ts-nocheck
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { CalendarView } from './CalendarView';
import { InterviewCard } from './InterviewCard';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';
import { getWeekStart, toDateString } from '../../utils/calendarUtils';

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
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    type:        'Phone Interview',
    date:        toDateString(new Date()),
    time:        '10:00',
    status:      'scheduled',
    ...overrides,
  };
}

function renderCalendar({ companies = [], highlightedInterviewId = null, onHighlightComplete = vi.fn() } = {}) {
  return render(
    <CalendarView
      companies={companies}
      interviewTypes={INTERVIEW_TYPES}
      onAddInterview={vi.fn()}
      onDeleteInterview={vi.fn()}
      onUpdateInterview={vi.fn()}
      highlightedInterviewId={highlightedInterviewId}
      onHighlightComplete={onHighlightComplete}
    />
  );
}

function renderCard({ interview = makeInterview(), highlightedInterviewId = null, onHighlightComplete = vi.fn() } = {}) {
  return render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={vi.fn()}
      onEdit={vi.fn()}
      highlightedInterviewId={highlightedInterviewId}
      onHighlightComplete={onHighlightComplete}
    />
  );
}

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

const scrollMock = vi.fn();

beforeEach(() => {
  scrollMock.mockClear();
  Element.prototype.scrollIntoView = scrollMock;
});

// ---------------------------------------------------------------------------
// H1: highlightedInterviewId refers to a non-existent interview
// ---------------------------------------------------------------------------

describe('H1: highlight targets non-existent interview', () => {
  it('does not crash when no interview matches the highlighted ID', () => {
    const onHighlightComplete = vi.fn();
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i1', date: toDateString(new Date()) })],
      }),
    ];

    // Should not throw
    renderCalendar({
      companies,
      highlightedInterviewId: 'non-existent-id',
      onHighlightComplete,
    });

    // Calendar still renders
    expect(screen.getByText('Interview Calendar')).toBeInTheDocument();
  });

  it('does not scroll or trigger highlight animation for non-existent interview', () => {
    const onHighlightComplete = vi.fn();
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i1', date: toDateString(new Date()) })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'non-existent-id',
      onHighlightComplete,
    });

    // scrollIntoView should NOT be called since no card matches
    expect(scrollMock).not.toHaveBeenCalled();
    // onHighlightComplete should NOT be called
    expect(onHighlightComplete).not.toHaveBeenCalled();
  });

  it('does not apply highlight class to any card when ID does not match', () => {
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i1', date: toDateString(new Date()) })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'non-existent-id',
    });

    const card = screen.getByText('Acme Corp').closest('.relative');
    expect(card.className).not.toContain('animate-highlight-pulse');
  });

  it('stays on current week when highlighted interview ID does not exist in any company', () => {
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i1', date: toDateString(new Date()), time: '09:00' })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'ghost-id',
    });

    // The current-week interview should still be visible (no spurious navigation)
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H2: highlighted interview has no date field
// ---------------------------------------------------------------------------

describe('H2: highlighted interview has no date', () => {
  it('does not crash when highlighted interview has undefined date', () => {
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i-nodate', date: undefined })],
      }),
    ];

    // CalendarView uses flattenAndSortInterviews which may exclude dateless
    // interviews. The useLayoutEffect loops companies and checks interview?.date.
    // This should not throw.
    renderCalendar({
      companies,
      highlightedInterviewId: 'i-nodate',
    });

    expect(screen.getByText('Interview Calendar')).toBeInTheDocument();
  });

  it('stays on current week when highlighted interview has no date', () => {
    const todayStr = toDateString(new Date());
    const companies = [
      makeCompany({
        interviews: [
          makeInterview({ id: 'i-nodate', date: undefined }),
          makeInterview({ id: 'i-today', date: todayStr, time: '11:00' }),
        ],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'i-nodate',
    });

    // Should remain on current week, showing the today interview
    expect(screen.getByText('11:00')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H3: onHighlightComplete called multiple times (animationend + fallback race)
// ---------------------------------------------------------------------------

describe('H3: onHighlightComplete double-fire guard (animationend + fallback timer race)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onHighlightComplete only once when animationend fires before fallback', () => {
    const onHighlightComplete = vi.fn();

    renderCard({
      interview: makeInterview({ id: 'i1' }),
      highlightedInterviewId: 'i1',
      onHighlightComplete,
    });

    const card = screen.getByText('Acme Corp').closest('.animate-highlight-pulse');

    // Fire animationend
    act(() => { card.dispatchEvent(new Event('animationend')); });
    expect(onHighlightComplete).toHaveBeenCalledTimes(1);

    // Advance past the 2-second fallback timer
    act(() => { vi.advanceTimersByTime(2500); });

    // Should still be called only once due to `cleared` guard
    expect(onHighlightComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onHighlightComplete only once when fallback fires before animationend', () => {
    const onHighlightComplete = vi.fn();

    renderCard({
      interview: makeInterview({ id: 'i1' }),
      highlightedInterviewId: 'i1',
      onHighlightComplete,
    });

    const card = screen.getByText('Acme Corp').closest('.animate-highlight-pulse');

    // Fire the 2-second fallback timer first
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onHighlightComplete).toHaveBeenCalledTimes(1);

    // Now fire animationend (late)
    act(() => { card.dispatchEvent(new Event('animationend')); });

    // Should still be called only once
    expect(onHighlightComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onHighlightComplete only once when animationend fires multiple times', () => {
    const onHighlightComplete = vi.fn();

    renderCard({
      interview: makeInterview({ id: 'i1' }),
      highlightedInterviewId: 'i1',
      onHighlightComplete,
    });

    const card = screen.getByText('Acme Corp').closest('.animate-highlight-pulse');

    // Fire animationend three times rapidly
    act(() => {
      card.dispatchEvent(new Event('animationend'));
      card.dispatchEvent(new Event('animationend'));
      card.dispatchEvent(new Event('animationend'));
    });

    expect(onHighlightComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// H4: highlightedInterviewId changes rapidly (click chip A, then B)
// ---------------------------------------------------------------------------

describe('H4: rapid highlight switching (chip A then chip B)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans up previous highlight effect when switching to a new interview', () => {
    const onHighlightComplete = vi.fn();
    const interviewA = makeInterview({ id: 'iA', companyName: 'Company A', time: '09:00' });
    const interviewB = makeInterview({ id: 'iB', companyName: 'Company B', time: '14:00' });

    // Render with interview A highlighted
    const { rerender } = render(
      <InterviewCard
        interview={interviewA}
        onDeleteInterview={vi.fn()}
        onEdit={vi.fn()}
        highlightedInterviewId="iA"
        onHighlightComplete={onHighlightComplete}
      />
    );

    expect(scrollMock).toHaveBeenCalledTimes(1);

    // Switch highlight away from A (now B is highlighted elsewhere)
    rerender(
      <InterviewCard
        interview={interviewA}
        onDeleteInterview={vi.fn()}
        onEdit={vi.fn()}
        highlightedInterviewId="iB"
        onHighlightComplete={onHighlightComplete}
      />
    );

    // Advance past the 2s fallback — it should have been cleaned up by the effect
    act(() => { vi.advanceTimersByTime(2500); });

    // The fallback timer from the first highlight should have been cleared,
    // so onHighlightComplete should NOT be called (card A is no longer highlighted)
    expect(onHighlightComplete).not.toHaveBeenCalled();
  });

  it('applies highlight to the second interview after rapid switch in CalendarView', () => {
    const onHighlightComplete = vi.fn();
    const todayStr = toDateString(new Date());
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Company A',
        interviews: [makeInterview({ id: 'iA', companyName: 'Company A', date: todayStr, time: '09:00' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'Company B',
        interviews: [makeInterview({ id: 'iB', companyId: 'c2', companyName: 'Company B', date: todayStr, time: '14:00' })],
      }),
    ];

    // First render with interview A highlighted
    const { rerender } = render(
      <CalendarView
        companies={companies}
        interviewTypes={INTERVIEW_TYPES}
        onAddInterview={vi.fn()}
        onDeleteInterview={vi.fn()}
        onUpdateInterview={vi.fn()}
        highlightedInterviewId="iA"
        onHighlightComplete={onHighlightComplete}
      />
    );

    const cardA = screen.getByText('Company A').closest('.relative');
    expect(cardA.className).toContain('animate-highlight-pulse');

    // Rapidly switch to highlight interview B
    rerender(
      <CalendarView
        companies={companies}
        interviewTypes={INTERVIEW_TYPES}
        onAddInterview={vi.fn()}
        onDeleteInterview={vi.fn()}
        onUpdateInterview={vi.fn()}
        highlightedInterviewId="iB"
        onHighlightComplete={onHighlightComplete}
      />
    );

    const cardB = screen.getByText('Company B').closest('.relative');
    expect(cardB.className).toContain('animate-highlight-pulse');

    // Card A should no longer be highlighted
    const cardAAfter = screen.getByText('Company A').closest('.relative');
    expect(cardAAfter.className).not.toContain('animate-highlight-pulse');
  });
});

// ---------------------------------------------------------------------------
// H5: highlighted interview is in the current week (no navigation needed)
// ---------------------------------------------------------------------------

describe('H5: highlighted interview is in the current week', () => {
  it('does not change the displayed week when interview is already visible', () => {
    const todayStr = toDateString(new Date());
    const onHighlightComplete = vi.fn();

    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i-today', date: todayStr, time: '10:00' })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'i-today',
      onHighlightComplete,
    });

    // Interview should be visible
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();

    // The highlight animation class should be applied
    const card = screen.getByText('Acme Corp').closest('.relative');
    expect(card.className).toContain('animate-highlight-pulse');

    // scrollIntoView should still be called
    expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('scrolls and highlights correctly when interview is in current week but different day', () => {
    // Use a weekday within this week (tomorrow or day after)
    const weekStart = getWeekStart(new Date());
    const midWeek = new Date(weekStart);
    midWeek.setDate(weekStart.getDate() + 3); // Wednesday
    const midWeekStr = toDateString(midWeek);

    const onHighlightComplete = vi.fn();
    const companies = [
      makeCompany({
        interviews: [makeInterview({ id: 'i-mid', date: midWeekStr, time: '15:00' })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'i-mid',
      onHighlightComplete,
    });

    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(scrollMock).toHaveBeenCalled();
  });

  it('navigates to a different week when highlighted interview is in the future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 21); // 3 weeks out
    const futureDateStr = toDateString(futureDate);

    const onHighlightComplete = vi.fn();
    const companies = [
      makeCompany({
        name: 'FutureCo',
        interviews: [makeInterview({ id: 'i-future', companyName: 'FutureCo', date: futureDateStr, time: '16:00' })],
      }),
    ];

    renderCalendar({
      companies,
      highlightedInterviewId: 'i-future',
      onHighlightComplete,
    });

    // CalendarView should have navigated to the future week
    expect(screen.getByText('FutureCo')).toBeInTheDocument();
    expect(screen.getByText('16:00')).toBeInTheDocument();
  });
});
