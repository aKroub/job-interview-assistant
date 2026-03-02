import {
  applyAddInterview,
  applyDelete,
  applyInterviewStatusUpdate,
  applyInterviewUpdate,
  applyStageUpdate,
  createCompany,
  deriveInterviewStatus,
  findCompanyByFuzzyName,
  flattenAndSortInterviews,
  isInPipeline,
  isMultiPipeline,
  matchByNameOnly,
  matchSuggestionToInterview,
  migrateCompanies,
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
// isInPipeline
// ---------------------------------------------------------------------------

describe('isInPipeline', () => {
  it('returns true when pipeline array contains the given ID', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'us'] });
    expect(isInPipeline(company, 'tel-aviv')).toBe(true);
    expect(isInPipeline(company, 'us')).toBe(true);
  });

  it('returns false when pipeline array does not contain the given ID', () => {
    const company = makeCompany({ pipeline: ['tel-aviv'] });
    expect(isInPipeline(company, 'us')).toBe(false);
  });

  it('returns false for an empty pipeline array', () => {
    const company = makeCompany({ pipeline: [] });
    expect(isInPipeline(company, 'tel-aviv')).toBe(false);
  });

  it('handles legacy scalar string pipeline (backwards compat)', () => {
    const company = makeCompany({ pipeline: 'us' });
    expect(isInPipeline(company, 'us')).toBe(true);
    expect(isInPipeline(company, 'tel-aviv')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMultiPipeline
// ---------------------------------------------------------------------------

describe('isMultiPipeline', () => {
  it('returns true when pipeline array has 2 or more entries', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'us'] });
    expect(isMultiPipeline(company)).toBe(true);
  });

  it('returns false when pipeline array has exactly 1 entry', () => {
    const company = makeCompany({ pipeline: ['tel-aviv'] });
    expect(isMultiPipeline(company)).toBe(false);
  });

  it('returns false when pipeline is a scalar string', () => {
    const company = makeCompany({ pipeline: 'tel-aviv' });
    expect(isMultiPipeline(company)).toBe(false);
  });

  it('returns false when pipeline is an empty array', () => {
    const company = makeCompany({ pipeline: [] });
    expect(isMultiPipeline(company)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCompany
// ---------------------------------------------------------------------------

describe('createCompany', () => {
  it('builds a company object with the supplied draft fields', () => {
    const draft = { name: 'Google', position: 'SWE', stage: 'applied', pipeline: ['tel-aviv'] };
    const company = createCompany(draft, () => 42);

    expect(company.name).toBe('Google');
    expect(company.position).toBe('SWE');
    expect(company.stage).toBe('applied');
    expect(company.pipeline).toEqual(['tel-aviv']);
  });

  it('assigns a string id from the idFn return value', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested', pipeline: ['us'] }, () => 999);
    expect(company.id).toBe('999');
  });

  it('initialises interviews as an empty array', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested', pipeline: ['tel-aviv'] }, () => 1);
    expect(company.interviews).toEqual([]);
  });

  it('initialises notes as an empty string', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested', pipeline: ['tel-aviv'] }, () => 1);
    expect(company.notes).toBe('');
  });

  it('sets createdAt to an ISO string', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested', pipeline: ['tel-aviv'] }, () => 1);
    expect(() => new Date(company.createdAt)).not.toThrow();
    expect(company.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores the pipeline array from the draft', () => {
    const company = createCompany({ name: 'X', position: 'Y', stage: 'interested', pipeline: ['tel-aviv', 'us'] }, () => 1);
    expect(company.pipeline).toEqual(['tel-aviv', 'us']);
  });
});

// ---------------------------------------------------------------------------
// migrateCompanies
// ---------------------------------------------------------------------------

describe('migrateCompanies', () => {
  it('wraps undefined pipeline in an array with the default', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result[0].pipeline).toEqual(['tel-aviv']);
  });

  it('wraps a scalar string pipeline in an array', () => {
    const companies = [makeCompany({ id: '1', pipeline: 'us' })];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result[0].pipeline).toEqual(['us']);
  });

  it('returns the original array reference when all pipelines are already arrays', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['us'] })];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result).toBe(companies);
  });

  it('does not mutate the original company objects', () => {
    const original = makeCompany({ id: '1' });
    const companies = [original];
    migrateCompanies(companies, 'tel-aviv');
    expect(original.pipeline).toBeUndefined();
  });

  it('does not mutate scalar pipeline companies', () => {
    const original = makeCompany({ id: '1', pipeline: 'us' });
    const companies = [original];
    migrateCompanies(companies, 'tel-aviv');
    expect(original.pipeline).toBe('us');
  });

  it('handles a mix of undefined, scalar, and array pipelines', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['us'] }),
      makeCompany({ id: '2', pipeline: 'tel-aviv' }),
      makeCompany({ id: '3' }),
    ];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result[0].pipeline).toEqual(['us']);
    expect(result[1].pipeline).toEqual(['tel-aviv']);
    expect(result[2].pipeline).toEqual(['tel-aviv']);
  });

  it('leaves multi-pipeline arrays unchanged', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] })];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result).toBe(companies);
    expect(result[0].pipeline).toEqual(['tel-aviv', 'us']);
  });

  it('returns the original array reference for an empty array', () => {
    const companies = [];
    const result = migrateCompanies(companies, 'tel-aviv');
    expect(result).toBe(companies);
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
    const result = applyStageUpdate(companies, '1', 'hr');
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

// ---------------------------------------------------------------------------
// matchSuggestionToInterview
// ---------------------------------------------------------------------------

describe('matchSuggestionToInterview', () => {
  it('matches by company name and date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };

    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches case-insensitively', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'GOOGLE',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'google', date: '2025-01-20', time: '' };

    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('returns null when no company matches', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'Meta', date: '2025-01-20', time: '' };

    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('returns null when date does not match', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-02-15', time: '' };

    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('returns null when suggestion has no company name', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google', interviews: [makeInterview()] }),
    ];
    expect(matchSuggestionToInterview(companies, { companyName: '', date: '2024-06-01' })).toBeNull();
  });

  it('returns null when suggestion has no date', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Google', interviews: [makeInterview()] }),
    ];
    expect(matchSuggestionToInterview(companies, { companyName: 'Google', date: '' })).toBeNull();
  });

  it('returns null for empty companies array', () => {
    expect(matchSuggestionToInterview([], { companyName: 'Google', date: '2025-01-20' })).toBeNull();
  });

  it('skips cancelled interviews', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', status: 'cancelled' })],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '' };

    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('prefers the interview with the closest time when multiple match the same date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [
          makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00' }),
          makeInterview({ id: 'i2', date: '2025-01-20', time: '14:30' }),
        ],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };

    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i2' });
  });

  it('matches by substring when suggestion name is shorter than tracker name', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Check Point Software Technologies',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'checkpoint', date: '2025-01-20', time: '14:00' };

    expect(matchSuggestionToInterview(companies, suggestion)).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches by substring when tracker name is shorter than suggestion name', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Meta',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    const suggestion = { companyName: 'Meta Platforms', date: '2025-01-20', time: '14:00' };

    expect(matchSuggestionToInterview(companies, suggestion)).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('prefers exact match over substring match', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Check Point Software Technologies',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'Check Point',
        interviews: [makeInterview({ id: 'i2', date: '2025-01-20', time: '15:00' })],
      }),
    ];
    const suggestion = { companyName: 'Check Point', date: '2025-01-20', time: '14:00' };

    // c2 is an exact match after normalization — should win even though c1 has a closer time
    expect(matchSuggestionToInterview(companies, suggestion)).toEqual({ companyId: 'c2', interviewId: 'i2' });
  });

  it('does not substring-match when shorter name is under 3 characters', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Meta',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];
    // "at" is contained in "meta" but is too short to be a reliable match
    const suggestion = { companyName: 'AT', date: '2025-01-20', time: '14:00' };

    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('picks closest time among two substring matches', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Check Point SW',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'Check Point Technologies',
        interviews: [makeInterview({ id: 'i2', date: '2025-01-20', time: '14:30' })],
      }),
    ];
    // "checkpoint" is a substring of both normalised names; pick closest time
    const suggestion = { companyName: 'checkpoint', date: '2025-01-20', time: '14:00' };

    expect(matchSuggestionToInterview(companies, suggestion)).toEqual({ companyId: 'c2', interviewId: 'i2' });
  });
});

// ---------------------------------------------------------------------------
// findCompanyByFuzzyName
// ---------------------------------------------------------------------------

describe('findCompanyByFuzzyName', () => {
  it('returns the company on exact normalised match', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    expect(findCompanyByFuzzyName(companies, 'google')).toBe(companies[0]);
  });

  it('returns the company on substring match (domain-style name)', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Check Point Software Technologies' })];
    expect(findCompanyByFuzzyName(companies, 'checkpoint')).toBe(companies[0]);
  });

  it('prefers exact match over substring match', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Check Point Software Technologies' }),
      makeCompany({ id: 'c2', name: 'Check Point' }),
    ];
    expect(findCompanyByFuzzyName(companies, 'Check Point')).toBe(companies[1]);
  });

  it('returns null when no company matches', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    expect(findCompanyByFuzzyName(companies, 'Meta')).toBeNull();
  });

  it('returns null for empty name', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Google' })];
    expect(findCompanyByFuzzyName(companies, '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyInterviewUpdate
// ---------------------------------------------------------------------------

describe('applyInterviewUpdate', () => {
  it('updates the specified fields on the matching interview', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00' })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-01-25', time: '14:00' });

    expect(result[0].interviews[0].date).toBe('2025-01-25');
    expect(result[0].interviews[0].time).toBe('14:00');
  });

  it('does not mutate the original data', () => {
    const interview = makeInterview({ id: 'i1', date: '2025-01-20' });
    const companies = [makeCompany({ id: 'c1', interviews: [interview] })];

    applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });

    expect(companies[0].interviews[0].date).toBe('2025-01-20');
  });

  it('leaves other interviews unchanged', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2025-01-20' }),
          makeInterview({ id: 'i2', date: '2025-01-25' }),
        ],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });

    expect(result[0].interviews[1].date).toBe('2025-01-25');
  });

  it('leaves other companies unchanged', () => {
    const companies = [
      makeCompany({ id: 'c1', interviews: [makeInterview({ id: 'i1' })] }),
      makeCompany({ id: 'c2', interviews: [makeInterview({ id: 'i2', date: '2025-03-01' })] }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });

    expect(result[1].interviews[0].date).toBe('2025-03-01');
  });

  it('preserves fields not included in updates', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1', type: 'Phone Screen', date: '2025-01-20', time: '10:00', status: 'scheduled' })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });

    expect(result[0].interviews[0].type).toBe('Phone Screen');
    expect(result[0].interviews[0].time).toBe('10:00');
    expect(result[0].interviews[0].status).toBe('scheduled');
  });
});

// ---------------------------------------------------------------------------
// matchByNameOnly — relaxed match by company name only (ignoring date)
// ---------------------------------------------------------------------------

describe('matchByNameOnly', () => {
  it('returns null when no company matches the suggestion name', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Acme' })];
    const result = matchByNameOnly(companies, { companyName: 'Unknown Corp' });
    expect(result).toBeNull();
  });

  it('returns null when the company has no interviews', () => {
    const companies = [makeCompany({ id: 'c1', name: 'Acme', interviews: [] })];
    const result = matchByNameOnly(companies, { companyName: 'Acme' });
    expect(result).toBeNull();
  });

  it('returns null when all interviews are cancelled', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [makeInterview({ id: 'i1', status: 'cancelled' })],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'Acme' });
    expect(result).toBeNull();
  });

  it('matches the single active interview regardless of date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'SentinelOne',
        interviews: [makeInterview({ id: 'i1', date: '2026-03-04', status: 'scheduled' })],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'SentinelOne', date: '2026-03-09' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('picks the interview with the closest date when multiple are active', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-01-10', status: 'scheduled' }),
          makeInterview({ id: 'i2', date: '2026-03-01', status: 'scheduled' }),
          makeInterview({ id: 'i3', date: '2026-06-15', status: 'completed' }),
        ],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'Acme', date: '2026-03-05' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i2' });
  });

  it('skips cancelled interviews when picking closest date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-04', status: 'cancelled' }),
          makeInterview({ id: 'i2', date: '2026-01-20', status: 'scheduled' }),
        ],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'Acme', date: '2026-03-05' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i2' });
  });

  it('returns first active interview when suggestion has no date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [
          makeInterview({ id: 'i1', status: 'scheduled' }),
          makeInterview({ id: 'i2', status: 'scheduled' }),
        ],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'Acme' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('uses fuzzy name matching (case-insensitive, substring)', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'SentinelOne Technologies',
        interviews: [makeInterview({ id: 'i1', date: '2026-03-04', status: 'scheduled' })],
      }),
    ];
    const result = matchByNameOnly(companies, { companyName: 'sentinelone', date: '2026-03-09' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('uses time as tiebreaker when two interviews share the same date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-04', time: '09:30', status: 'scheduled' }),
          makeInterview({ id: 'i2', date: '2026-03-04', time: '14:00', status: 'scheduled' }),
        ],
      }),
    ];
    // Suggestion at 10:00 — closer to the 09:30 interview
    const result = matchByNameOnly(companies, { companyName: 'Acme', date: '2026-03-09', time: '10:00' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('uses time tiebreaker to pick the afternoon interview', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Acme',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-04', time: '09:30', status: 'scheduled' }),
          makeInterview({ id: 'i2', date: '2026-03-04', time: '14:00', status: 'scheduled' }),
        ],
      }),
    ];
    // Suggestion at 15:00 — closer to the 14:00 interview
    const result = matchByNameOnly(companies, { companyName: 'Acme', date: '2026-03-09', time: '15:00' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i2' });
  });

  it('does not mutate the input companies array', () => {
    const interviews = [makeInterview({ id: 'i1', status: 'scheduled' })];
    const companies = Object.freeze([
      Object.freeze(makeCompany({ id: 'c1', name: 'Acme', interviews: Object.freeze(interviews) })),
    ]);
    const result = matchByNameOnly(companies, { companyName: 'Acme', date: '2026-01-01' });
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });
});
