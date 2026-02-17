import {
  createCompany,
  applyStageUpdate,
  applyDelete,
  applyAddInterview,
  applyInterviewStatusUpdate,
  flattenAndSortInterviews,
} from './companyUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a minimal company object with sensible defaults. */
function makeCompany(overrides = {}) {
  return {
    id:         '1',
    name:       'Acme Corp',
    position:   'Engineer',
    stage:      'applied',
    interviews: [],
    notes:      '',
    createdAt:  '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Returns a minimal interview object with sensible defaults. */
function makeInterview(overrides = {}) {
  return {
    id:     'i1',
    type:   'Phone Screen',
    date:   '2024-06-01',
    time:   '10:00',
    status: 'scheduled',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createCompany
// ---------------------------------------------------------------------------

describe('createCompany', () => {
  it('builds a company object with the supplied draft fields', () => {
    const draft = { name: 'Google', position: 'SWE', stage: 'applied' };
    const company = createCompany(draft, () => 42);

    expect(company.name).toBe('Google');
    expect(company.position).toBe('SWE');
    expect(company.stage).toBe('applied');
  });

  it('assigns a string id from the idFn return value', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested' }, () => 999);
    expect(company.id).toBe('999');
  });

  it('initialises interviews as an empty array', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested' }, () => 1);
    expect(company.interviews).toEqual([]);
  });

  it('initialises notes as an empty string', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested' }, () => 1);
    expect(company.notes).toBe('');
  });

  it('sets createdAt to an ISO string', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested' }, () => 1);
    expect(() => new Date(company.createdAt)).not.toThrow();
    expect(company.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// applyStageUpdate
// ---------------------------------------------------------------------------

describe('applyStageUpdate', () => {
  it('updates the stage of the matching company', () => {
    const companies = [makeCompany({ id: '1', stage: 'applied' })];
    const result = applyStageUpdate(companies, '1', 'technical');
    expect(result[0].stage).toBe('technical');
  });

  it('does not mutate the original array', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyStageUpdate(companies, '1', 'offer');
    expect(result).not.toBe(companies);
    expect(result[0]).not.toBe(companies[0]);
  });

  it('leaves other companies unchanged', () => {
    const companies = [
      makeCompany({ id: '1', stage: 'applied' }),
      makeCompany({ id: '2', stage: 'phone' }),
    ];
    const result = applyStageUpdate(companies, '1', 'final');
    expect(result[1].stage).toBe('phone');
  });

  it('returns array unchanged when id is not found', () => {
    const companies = [makeCompany({ id: '1', stage: 'applied' })];
    const result = applyStageUpdate(companies, 'nonexistent', 'offer');
    expect(result[0].stage).toBe('applied');
  });
});

// ---------------------------------------------------------------------------
// applyDelete
// ---------------------------------------------------------------------------

describe('applyDelete', () => {
  it('removes the company with the given id', () => {
    const companies = [makeCompany({ id: '1' }), makeCompany({ id: '2' })];
    const result = applyDelete(companies, '1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('does not mutate the original array', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyDelete(companies, '1');
    expect(result).not.toBe(companies);
  });

  it('returns same-length array when id is not found', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyDelete(companies, 'nonexistent');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// applyAddInterview
// ---------------------------------------------------------------------------

describe('applyAddInterview', () => {
  it('appends an interview to the target company', () => {
    const companies = [makeCompany({ id: '1' })];
    const interview = { type: 'Technical', date: '2024-07-01', time: '09:00', status: 'scheduled' };
    const result = applyAddInterview(companies, '1', interview, () => 77);

    expect(result[0].interviews).toHaveLength(1);
    expect(result[0].interviews[0].type).toBe('Technical');
    expect(result[0].interviews[0].id).toBe('77');
  });

  it('does not mutate the original company', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyAddInterview(companies, '1', makeInterview(), () => 1);
    expect(result[0]).not.toBe(companies[0]);
    expect(companies[0].interviews).toHaveLength(0);
  });

  it('leaves other companies unchanged', () => {
    const companies = [makeCompany({ id: '1' }), makeCompany({ id: '2' })];
    const result = applyAddInterview(companies, '1', makeInterview(), () => 1);
    expect(result[1].interviews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyInterviewStatusUpdate
// ---------------------------------------------------------------------------

describe('applyInterviewStatusUpdate', () => {
  it('updates the status of the matching interview', () => {
    const companies = [
      makeCompany({ id: '1', interviews: [makeInterview({ id: 'i1', status: 'scheduled' })] }),
    ];
    const result = applyInterviewStatusUpdate(companies, '1', 'i1', 'completed');
    expect(result[0].interviews[0].status).toBe('completed');
  });

  it('does not mutate the original data', () => {
    const interview = makeInterview({ id: 'i1', status: 'scheduled' });
    const companies = [makeCompany({ id: '1', interviews: [interview] })];
    applyInterviewStatusUpdate(companies, '1', 'i1', 'cancelled');
    expect(companies[0].interviews[0].status).toBe('scheduled');
  });

  it('leaves other interviews on the same company unchanged', () => {
    const companies = [
      makeCompany({
        id: '1',
        interviews: [
          makeInterview({ id: 'i1', status: 'scheduled' }),
          makeInterview({ id: 'i2', status: 'scheduled' }),
        ],
      }),
    ];
    const result = applyInterviewStatusUpdate(companies, '1', 'i1', 'completed');
    expect(result[0].interviews[1].status).toBe('scheduled');
  });
});

// ---------------------------------------------------------------------------
// flattenAndSortInterviews
// ---------------------------------------------------------------------------

describe('flattenAndSortInterviews', () => {
  it('returns an empty array when there are no companies', () => {
    expect(flattenAndSortInterviews([])).toEqual([]);
  });

  it('returns an empty array when companies have no interviews', () => {
    expect(flattenAndSortInterviews([makeCompany()])).toEqual([]);
  });

  it('decorates each interview with companyName, position, and companyId', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google', position: 'SWE', interviews: [makeInterview({ id: 'i1', date: '2024-06-01' })] }),
    ];
    const result = flattenAndSortInterviews(companies);
    expect(result[0].companyName).toBe('Google');
    expect(result[0].position).toBe('SWE');
    expect(result[0].companyId).toBe('c1');
  });

  it('sorts interviews chronologically by date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i2', date: '2024-08-01' }),
          makeInterview({ id: 'i1', date: '2024-06-01' }),
        ],
      }),
    ];
    const result = flattenAndSortInterviews(companies);
    expect(result[0].id).toBe('i1');
    expect(result[1].id).toBe('i2');
  });

  it('flattens interviews across multiple companies', () => {
    const companies = [
      makeCompany({ id: 'c1', interviews: [makeInterview({ id: 'i1', date: '2024-06-01' })] }),
      makeCompany({ id: 'c2', interviews: [makeInterview({ id: 'i2', date: '2024-07-01' })] }),
    ];
    expect(flattenAndSortInterviews(companies)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deriveInterviewStatus
// ---------------------------------------------------------------------------

import { deriveInterviewStatus } from './companyUtils';

describe('deriveInterviewStatus', () => {
  const PAST   = new Date('2030-01-01T00:00:00.000Z'); // "now" is in the future → interview is in the past
  const FUTURE = new Date('2000-01-01T00:00:00.000Z'); // "now" is in the past  → interview is in the future

  it('returns "scheduled" when the interview datetime is in the future', () => {
    const interview = { date: '2025-01-01', time: '10:00', status: 'scheduled' };
    expect(deriveInterviewStatus(interview, FUTURE)).toBe('scheduled');
  });

  it('returns "passed" when the interview datetime is in the past and status is scheduled', () => {
    const interview = { date: '2025-01-01', time: '10:00', status: 'scheduled' };
    expect(deriveInterviewStatus(interview, PAST)).toBe('passed');
  });

  it('uses end-of-day (23:59) when no time is provided', () => {
    const interview = { date: '2025-01-01', time: '', status: 'scheduled' };
    expect(deriveInterviewStatus(interview, PAST)).toBe('passed');
  });

  it('returns "cancelled" regardless of datetime when status is cancelled', () => {
    const interview = { date: '2025-01-01', time: '10:00', status: 'cancelled' };
    expect(deriveInterviewStatus(interview, FUTURE)).toBe('cancelled');
    expect(deriveInterviewStatus(interview, PAST)).toBe('cancelled');
  });

  it('returns "completed" regardless of datetime when status is completed', () => {
    const interview = { date: '2025-01-01', time: '10:00', status: 'completed' };
    expect(deriveInterviewStatus(interview, FUTURE)).toBe('completed');
    expect(deriveInterviewStatus(interview, PAST)).toBe('completed');
  });
});
