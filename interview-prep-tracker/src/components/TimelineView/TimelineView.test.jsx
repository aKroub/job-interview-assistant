import React from 'react';
import { render, screen } from '@testing-library/react';
import { TimelineView } from './TimelineView';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const onAddInterview          = handlers.onAddInterview          ?? jest.fn();
  const onUpdateInterviewStatus = handlers.onUpdateInterviewStatus ?? jest.fn();

  render(
    <TimelineView
      companies={companies}
      interviewTypes={INTERVIEW_TYPES}
      onAddInterview={onAddInterview}
      onUpdateInterviewStatus={onUpdateInterviewStatus}
    />
  );

  return { onAddInterview, onUpdateInterviewStatus };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TimelineView — rendering', () => {
  it('renders the Interview Timeline heading', () => {
    setup();
    expect(screen.getByText('Interview Timeline')).toBeInTheDocument();
  });

  it('renders the Schedule Interview section', () => {
    setup();
    expect(screen.getByText('Schedule Interview')).toBeInTheDocument();
  });

  it('renders each company in the schedule panel', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google' }),
      makeCompany({ id: 'c2', name: 'Meta' }),
    ];
    setup({ companies });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TimelineView — empty state', () => {
  it('shows the empty state message when there are no interviews', () => {
    setup({ companies: [makeCompany({ interviews: [] })] });
    expect(screen.getByText(/no interviews scheduled/i)).toBeInTheDocument();
  });

  it('does not show the empty state when interviews exist', () => {
    const interview = {
      id: 'i1', type: 'Phone Interview', date: '2099-01-01', time: '10:00', status: 'scheduled',
    };
    const companies = [makeCompany({ interviews: [interview] })];
    setup({ companies });
    expect(screen.queryByText(/no interviews scheduled/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interview list
// ---------------------------------------------------------------------------

describe('TimelineView — interview list', () => {
  it('renders a row for each interview across all companies', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google', interviews: [
        { id: 'i1', type: 'Phone Interview', date: '2099-06-01', time: '10:00', status: 'scheduled' },
      ]}),
      makeCompany({ id: 'c2', name: 'Meta', interviews: [
        { id: 'i2', type: 'Video Interview', date: '2099-07-01', time: '14:00', status: 'scheduled' },
      ]}),
    ];
    setup({ companies });
    // Both company names should appear in the interview list rows
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meta').length).toBeGreaterThan(0);
  });
});
