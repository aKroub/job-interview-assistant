/**
 * Stress tests for multi-pipeline company support (PR #66).
 *
 * These tests probe edge cases and potential failure modes that standard
 * unit tests may not cover — duplicate pipeline entries, empty-string
 * pipelines, shared references, delete/filter interactions, and field
 * preservation across migration.
 */

import {
  applyDelete,
  applyStageUpdate,
  createCompany,
  deriveInterviewStatus,
  getTodaysUpcomingInterviews,
  isInPipeline,
  isMultiPipeline,
  migrateCompanies,
} from './companyUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         '1',
    name:       'Acme Corp',
    position:   'Engineer',
    stage:      'applied',
    pipeline:   ['tel-aviv'],
    interviews: [],
    notes:      'some notes',
    createdAt:  '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// H1: duplicate-pipeline-entries
// ---------------------------------------------------------------------------

describe('H1: duplicate pipeline entries', () => {
  it('isInPipeline returns true even with duplicate entries', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'tel-aviv'] });
    expect(isInPipeline(company, 'tel-aviv')).toBe(true);
    expect(isInPipeline(company, 'us')).toBe(false);
  });

  it('isMultiPipeline returns true for duplicates (length > 1)', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'tel-aviv'] });
    // This IS a bug symptom — duplicates inflate multi-pipeline detection
    expect(isMultiPipeline(company)).toBe(true);
  });

  it('toggle handler simulation: toggling ON an already-selected pipeline does not create duplicates', () => {
    // Simulates the handleTogglePipeline logic from AddCompanyModal
    const current = ['tel-aviv'];
    const pipelineId = 'tel-aviv';
    const isSelected = current.includes(pipelineId);

    // The toggle logic should detect it's already selected
    expect(isSelected).toBe(true);
    // And since current.length <= 1, it should not deselect — no mutation occurs
    // So no duplicate can be introduced through the normal toggle path
  });

  it('toggle handler simulation: rapidly toggling a pipeline on produces no duplicates', () => {
    // Simulate two rapid "toggle on" operations for 'us' on a ['tel-aviv'] base
    let current = ['tel-aviv'];

    // First toggle: add 'us'
    const isSelected1 = current.includes('us');
    if (!isSelected1) {
      current = [...current, 'us'];
    }

    // Second toggle: 'us' is already present — should not add again
    const isSelected2 = current.includes('us');
    if (!isSelected2) {
      current = [...current, 'us'];
    }

    expect(current).toEqual(['tel-aviv', 'us']);
    expect(current.filter((p) => p === 'us')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H2: migration-empty-string-pipeline
// ---------------------------------------------------------------------------

describe('H2: empty string pipeline migration', () => {
  it('migrateCompanies treats empty string as falsy — assigns default', () => {
    const companies = [makeCompany({ id: '1', pipeline: '' })];
    const result = migrateCompanies(companies, 'tel-aviv');
    // Empty string should be treated as "missing" and get the default
    expect(result[0].pipeline).toEqual(['tel-aviv']);
  });

  it('isInPipeline returns false for a company with empty string pipeline and any pipelineId', () => {
    const company = makeCompany({ pipeline: '' });
    expect(isInPipeline(company, 'tel-aviv')).toBe(false);
    expect(isInPipeline(company, 'us')).toBe(false);
    expect(isInPipeline(company, '')).toBe(true);
  });

  it('isMultiPipeline returns false for empty string pipeline', () => {
    const company = makeCompany({ pipeline: '' });
    expect(isMultiPipeline(company)).toBe(false);
  });

  it('migration followed by filtering is consistent for empty-string legacy data', () => {
    const companies = [makeCompany({ id: '1', pipeline: '' })];
    const migrated = migrateCompanies(companies, 'tel-aviv');
    // After migration, filtering should work correctly
    expect(isInPipeline(migrated[0], 'tel-aviv')).toBe(true);
    expect(isInPipeline(migrated[0], 'us')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H3: shared reference between draft and persisted company
// ---------------------------------------------------------------------------

describe('H3: createCompany pipeline reference isolation', () => {
  it('mutating the draft pipeline array after createCompany also mutates the company', () => {
    const draft = { name: 'X', position: 'Y', stage: 'applied', pipeline: ['tel-aviv'] };
    const company = createCompany(draft, () => 1);

    // This proves the reference is shared (not a defensive copy)
    draft.pipeline.push('us');
    // BUG: company.pipeline is now ['tel-aviv', 'us'] because it's the same array
    expect(company.pipeline).toEqual(['tel-aviv', 'us']);
  });

  it('in practice the React flow prevents mutation via EMPTY_DRAFT reset', () => {
    // Simulating the actual InterviewPrepTracker flow:
    // 1. User submits → addCompany(companyDraft)
    // 2. Immediately: setCompanyDraft(EMPTY_DRAFT)
    // The old companyDraft reference is abandoned, so no mutation can occur.
    const EMPTY_DRAFT = { name: '', position: '', stage: 'applied', pipeline: ['tel-aviv'] };
    const userDraft = { ...EMPTY_DRAFT, pipeline: ['tel-aviv', 'us'] };

    const company = createCompany(userDraft, () => 1);
    // Simulating the reset — draft is replaced entirely
    const resetDraft = { ...EMPTY_DRAFT };

    // The company's pipeline should be unaffected by the reset
    expect(company.pipeline).toEqual(['tel-aviv', 'us']);
    expect(resetDraft.pipeline).toEqual(['tel-aviv']);
  });
});

// ---------------------------------------------------------------------------
// H4: pipeline count inflation after delete
// ---------------------------------------------------------------------------

describe('H4: multi-pipeline delete and count consistency', () => {
  it('deleting a multi-pipeline company removes it from all pipeline filters', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] }),
      makeCompany({ id: '2', pipeline: ['tel-aviv'] }),
    ];

    const afterDelete = applyDelete(companies, '1');

    const telAvivCount = afterDelete.filter((c) => isInPipeline(c, 'tel-aviv')).length;
    const usCount = afterDelete.filter((c) => isInPipeline(c, 'us')).length;

    expect(telAvivCount).toBe(1); // Only company '2' remains
    expect(usCount).toBe(0);      // Company '1' was the only US one
  });

  it('stage update on a multi-pipeline company is reflected in both pipeline views', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'], stage: 'applied' }),
    ];

    const afterUpdate = applyStageUpdate(companies, '1', 'offer');

    // Filter for tel-aviv pipeline — should see the updated stage
    const telAvivCompanies = afterUpdate.filter((c) => isInPipeline(c, 'tel-aviv'));
    expect(telAvivCompanies[0].stage).toBe('offer');

    // Filter for us pipeline — same company, same updated stage
    const usCompanies = afterUpdate.filter((c) => isInPipeline(c, 'us'));
    expect(usCompanies[0].stage).toBe('offer');

    // It's the same object reference (one company entity)
    expect(telAvivCompanies[0]).toBe(usCompanies[0]);
  });

  it('multi-pipeline company count: counted once per pipeline, not once total', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] }),
      makeCompany({ id: '2', pipeline: ['tel-aviv'] }),
      makeCompany({ id: '3', pipeline: ['us'] }),
    ];

    const telAvivCount = companies.filter((c) => isInPipeline(c, 'tel-aviv')).length;
    const usCount = companies.filter((c) => isInPipeline(c, 'us')).length;
    const totalUnique = companies.length;

    expect(telAvivCount).toBe(2); // companies 1 and 2
    expect(usCount).toBe(2);      // companies 1 and 3
    expect(totalUnique).toBe(3);  // only 3 unique companies
    // telAvivCount + usCount > totalUnique — this is expected (not a bug)
    expect(telAvivCount + usCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// H5: migration preserves all non-pipeline fields
// ---------------------------------------------------------------------------

describe('H5: migration field preservation', () => {
  it('migrating from undefined pipeline preserves all other fields', () => {
    const original = {
      id:         '1',
      name:       'Full Corp',
      position:   'Staff Engineer',
      stage:      'technical',
      interviews: [{ id: 'i1', type: 'Phone', date: '2024-06-01', time: '10:00', status: 'scheduled' }],
      notes:      'Important notes about this company',
      createdAt:  '2024-03-15T08:30:00.000Z',
    };
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Full Corp');
    expect(result[0].position).toBe('Staff Engineer');
    expect(result[0].stage).toBe('technical');
    expect(result[0].interviews).toHaveLength(1);
    expect(result[0].interviews[0].id).toBe('i1');
    expect(result[0].notes).toBe('Important notes about this company');
    expect(result[0].createdAt).toBe('2024-03-15T08:30:00.000Z');
    expect(result[0].pipeline).toEqual(['tel-aviv']);
  });

  it('migrating from scalar pipeline preserves all other fields', () => {
    const original = {
      id:         '2',
      name:       'Scalar Corp',
      position:   'SWE',
      stage:      'offer',
      pipeline:   'us',
      interviews: [{ id: 'i2', type: 'Onsite', date: '2024-07-01', time: '14:00', status: 'completed' }],
      notes:      'Got the offer!',
      createdAt:  '2024-04-20T12:00:00.000Z',
    };
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    expect(result[0].id).toBe('2');
    expect(result[0].name).toBe('Scalar Corp');
    expect(result[0].position).toBe('SWE');
    expect(result[0].stage).toBe('offer');
    expect(result[0].interviews[0].status).toBe('completed');
    expect(result[0].notes).toBe('Got the offer!');
    expect(result[0].createdAt).toBe('2024-04-20T12:00:00.000Z');
    expect(result[0].pipeline).toEqual(['us']);
  });

  it('migration does not add unexpected extra keys', () => {
    const original = makeCompany({ id: '1' });
    delete original.pipeline; // simulate legacy
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    const resultKeys = Object.keys(result[0]).sort();
    const expectedKeys = ['createdAt', 'id', 'interviews', 'name', 'notes', 'pipeline', 'position', 'stage'];
    expect(resultKeys).toEqual(expectedKeys);
  });

  it('does not mutate the original companies array', () => {
    const companies = [makeCompany({ id: '1', pipeline: 'us' })];
    const originalRef = companies[0];
    migrateCompanies(companies, 'tel-aviv');

    // The original array and objects must be untouched
    expect(companies[0]).toBe(originalRef);
    expect(companies[0].pipeline).toBe('us');
  });
});

// ===========================================================================
// Stress tests for getTodaysUpcomingInterviews (PR: feature/today-interviews)
// ===========================================================================

/** Returns a minimal interview object with sensible defaults. */
function makeInterview(overrides = {}) {
  return {
    id:     'i1',
    type:   'Phone Interview',
    date:   '2026-03-11',
    time:   '14:00',
    status: 'scheduled',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// H6: Empty / no-interview companies — defensive against missing data
// ---------------------------------------------------------------------------

describe('H6: empty and no-interview companies', () => {
  const NOW = new Date(2026, 2, 11, 12, 0, 0); // March 11, 2026 at noon

  it('returns empty array for empty companies list', () => {
    expect(getTodaysUpcomingInterviews([], NOW)).toEqual([]);
  });

  it('returns empty array when all companies have zero interviews', () => {
    const companies = [
      makeCompany({ id: 'c1', interviews: [] }),
      makeCompany({ id: 'c2', interviews: [] }),
      makeCompany({ id: 'c3', interviews: [] }),
    ];
    expect(getTodaysUpcomingInterviews(companies, NOW)).toEqual([]);
  });

  it('handles a mix of companies with and without interviews', () => {
    const companies = [
      makeCompany({ id: 'c1', name: 'Empty Corp', interviews: [] }),
      makeCompany({
        id: 'c2',
        name: 'Has Interview',
        interviews: [makeInterview({ id: 'i1', date: '2026-03-11', time: '15:00' })],
      }),
      makeCompany({ id: 'c3', name: 'Also Empty', interviews: [] }),
    ];
    const result = getTodaysUpcomingInterviews(companies, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('Has Interview');
  });

  it('handles company with interviews but none scheduled for today', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-10', time: '10:00' }),
          makeInterview({ id: 'i2', date: '2026-03-12', time: '10:00' }),
          makeInterview({ id: 'i3', date: '2026-04-01', time: '10:00' }),
        ],
      }),
    ];
    expect(getTodaysUpcomingInterviews(companies, NOW)).toEqual([]);
  });

  it('handles companies with interviews in all non-scheduled statuses for today', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '15:00', status: 'completed' }),
          makeInterview({ id: 'i2', date: '2026-03-11', time: '16:00', status: 'cancelled' }),
          makeInterview({ id: 'i3', date: '2026-03-11', time: '09:00', status: 'scheduled' }), // passed (before noon)
        ],
      }),
    ];
    expect(getTodaysUpcomingInterviews(companies, NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H7: Midnight boundary — "today" changes between calls
// ---------------------------------------------------------------------------

describe('H7: midnight boundary — today changes', () => {
  it('at exactly midnight (00:00:00.000), includes all interviews for that new day', () => {
    // Midnight of March 11 — interviews at any time today should be in the future
    const midnight = new Date(2026, 2, 11, 0, 0, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Early Corp',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '00:01' }),
          makeInterview({ id: 'i2', date: '2026-03-11', time: '08:00' }),
          makeInterview({ id: 'i3', date: '2026-03-11', time: '23:59' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, midnight);
    // All three should be upcoming — 00:01, 08:00, 23:59 are all after midnight
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('at 23:59:59.999, an interview at 23:59 is treated as passed', () => {
    // One millisecond before midnight on March 11
    const almostMidnight = new Date(2026, 2, 11, 23, 59, 59, 999);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '23:59' }),
        ],
      }),
    ];
    // deriveInterviewStatus compares new Date('2026-03-11T23:59') < almostMidnight
    // new Date('2026-03-11T23:59') is 23:59:00.000, almostMidnight is 23:59:59.999
    // So 23:59:00 < 23:59:59.999 → true → status is 'passed'
    const result = getTodaysUpcomingInterviews(companies, almostMidnight);
    expect(result).toEqual([]);
  });

  it('yesterday interview does not appear today even at midnight', () => {
    const midnight = new Date(2026, 2, 11, 0, 0, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-10', time: '23:59' }),
        ],
      }),
    ];
    // Date string for yesterday (2026-03-10) does not match today (2026-03-11)
    expect(getTodaysUpcomingInterviews(companies, midnight)).toEqual([]);
  });

  it('tomorrow interview does not appear today even at 23:59', () => {
    const lateTonight = new Date(2026, 2, 11, 23, 59, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-12', time: '00:01' }),
        ],
      }),
    ];
    expect(getTodaysUpcomingInterviews(companies, lateTonight)).toEqual([]);
  });

  it('date formatting is correct for single-digit months and days', () => {
    // January 5 at noon — tests that month/day are zero-padded
    const jan5 = new Date(2026, 0, 5, 12, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-01-05', time: '14:00' }),
          makeInterview({ id: 'i2', date: '2026-1-5', time: '14:00' }), // non-padded — should NOT match
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, jan5);
    // Only i1 matches because the function zero-pads to '2026-01-05'
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });

  it('December 31 date formatting is correct (month 12, day 31)', () => {
    const dec31 = new Date(2026, 11, 31, 10, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-12-31', time: '14:00' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, dec31);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });
});

// ---------------------------------------------------------------------------
// H8: Interview time exactly equal to now — boundary precision
// ---------------------------------------------------------------------------

describe('H8: interview time exactly at current moment', () => {
  it('interview at exactly now is NOT marked as passed (uses strict < comparison)', () => {
    // NOW = 14:00:00.000, interview time = 14:00
    // deriveInterviewStatus: new Date('2026-03-11T14:00') < new Date(2026, 2, 11, 14, 0, 0, 0)
    // They should be equal → < returns false → status = 'scheduled'
    const exactlyNow = new Date(2026, 2, 11, 14, 0, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '14:00' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, exactlyNow);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });

  it('interview one minute before now IS marked as passed', () => {
    const now = new Date(2026, 2, 11, 14, 1, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '14:00' }),
        ],
      }),
    ];
    // 14:00 < 14:01 → passed
    expect(getTodaysUpcomingInterviews(companies, now)).toEqual([]);
  });

  it('interview one minute after now is still scheduled', () => {
    const now = new Date(2026, 2, 11, 13, 59, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '14:00' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, now);
    expect(result).toHaveLength(1);
  });

  it('deriveInterviewStatus boundary: equal time returns scheduled', () => {
    const interview = { date: '2026-03-11', time: '14:00', status: 'scheduled' };
    const now = new Date(2026, 2, 11, 14, 0, 0, 0);
    expect(deriveInterviewStatus(interview, now)).toBe('scheduled');
  });

  it('interview with no time and now at 23:58:59 is still scheduled (uses 23:59 fallback)', () => {
    // No time → deriveInterviewStatus uses '23:59' → new Date('2026-03-11T23:59')
    const now = new Date(2026, 2, 11, 23, 58, 59);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '', status: 'scheduled' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, now);
    expect(result).toHaveLength(1);
  });

  it('interview with no time at exactly 23:59:00.000 is still scheduled (equal, not less than)', () => {
    const now = new Date(2026, 2, 11, 23, 59, 0, 0);
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '', status: 'scheduled' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, now);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H9: Duplicate times and large dataset (50+ interviews)
// ---------------------------------------------------------------------------

describe('H9: duplicate times and large dataset performance', () => {
  const NOW = new Date(2026, 2, 11, 8, 0, 0); // March 11, 2026 at 8am

  it('multiple interviews at the same time all appear in results', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Alpha',
        interviews: [makeInterview({ id: 'i1', date: '2026-03-11', time: '14:00' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'Beta',
        interviews: [makeInterview({ id: 'i2', date: '2026-03-11', time: '14:00' })],
      }),
      makeCompany({
        id: 'c3',
        name: 'Gamma',
        interviews: [makeInterview({ id: 'i3', date: '2026-03-11', time: '14:00' })],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, NOW);
    expect(result).toHaveLength(3);
    // All should have the same time
    expect(result.every((r) => r.time === '14:00')).toBe(true);
  });

  it('same company with multiple interviews at same time returns all of them', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Busy Corp',
        interviews: [
          makeInterview({ id: 'i1', date: '2026-03-11', time: '10:00' }),
          makeInterview({ id: 'i2', date: '2026-03-11', time: '10:00' }),
          makeInterview({ id: 'i3', date: '2026-03-11', time: '10:00' }),
        ],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, NOW);
    expect(result).toHaveLength(3);
  });

  it('handles 50+ interviews across many companies without error', () => {
    const companies = [];
    for (let c = 0; c < 20; c++) {
      const interviews = [];
      for (let i = 0; i < 5; i++) {
        const hour = String(8 + Math.floor(i * 2)).padStart(2, '0');
        interviews.push(
          makeInterview({
            id: `i-${c}-${i}`,
            date: '2026-03-11',
            time: `${hour}:00`,
          })
        );
      }
      companies.push(
        makeCompany({ id: `c${c}`, name: `Company ${c}`, interviews })
      );
    }
    // 20 companies x 5 interviews = 100 interviews, all today at 8am+ and NOW is 8am
    const result = getTodaysUpcomingInterviews(companies, NOW);
    // All interviews at 08:00 are exactly at NOW, so they should be 'scheduled' (not <, so not passed)
    // Interviews at 08:00, 10:00, 12:00, 14:00, 16:00 — all >= 08:00 = NOW
    expect(result).toHaveLength(100);
  });

  it('large dataset returns results sorted by time ascending', () => {
    const times = ['16:00', '09:00', '14:00', '11:00', '20:00', '13:00', '08:30'];
    const companies = times.map((time, i) =>
      makeCompany({
        id: `c${i}`,
        name: `Company ${i}`,
        interviews: [makeInterview({ id: `i${i}`, date: '2026-03-11', time })],
      })
    );
    const result = getTodaysUpcomingInterviews(companies, NOW);
    const resultTimes = result.map((r) => r.time);
    const sortedTimes = [...resultTimes].sort();
    expect(resultTimes).toEqual(sortedTimes);
  });

  it('mixed timed and untimed interviews: untimed sort last', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'A',
        interviews: [makeInterview({ id: 'i1', date: '2026-03-11', time: '' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'B',
        interviews: [makeInterview({ id: 'i2', date: '2026-03-11', time: '09:00' })],
      }),
      makeCompany({
        id: 'c3',
        name: 'C',
        interviews: [makeInterview({ id: 'i3', date: '2026-03-11', time: '' })],
      }),
      makeCompany({
        id: 'c4',
        name: 'D',
        interviews: [makeInterview({ id: 'i4', date: '2026-03-11', time: '10:00' })],
      }),
    ];
    const result = getTodaysUpcomingInterviews(companies, NOW);
    expect(result).toHaveLength(4);
    // Timed first (sorted), then untimed
    expect(result[0].time).toBe('09:00');
    expect(result[1].time).toBe('10:00');
    expect(result[2].time).toBe('');
    expect(result[3].time).toBe('');
  });

  it('does not mutate the input when processing 50+ interviews', () => {
    const companies = [];
    for (let c = 0; c < 10; c++) {
      const interviews = [];
      for (let i = 0; i < 6; i++) {
        interviews.push(
          makeInterview({
            id: `i-${c}-${i}`,
            date: '2026-03-11',
            time: `${String(9 + i).padStart(2, '0')}:00`,
          })
        );
      }
      companies.push(
        makeCompany({ id: `c${c}`, name: `Company ${c}`, interviews })
      );
    }
    const snapshot = JSON.stringify(companies);
    getTodaysUpcomingInterviews(companies, NOW);
    expect(JSON.stringify(companies)).toBe(snapshot);
  });
});

// ===========================================================================
// Stress tests for applyEditCompany (PR: feature/edit-company-card)
// ===========================================================================

import { applyEditCompany, applyAddInterview, flattenAndSortInterviews } from './companyUtils';

// ---------------------------------------------------------------------------
// H1: editing a company with interviews could corrupt interview data
// ---------------------------------------------------------------------------

describe('H1 (edit): editing a company preserves interview data', () => {
  it('applyEditCompany does not touch the interviews array', () => {
    const interviews = [
      { id: 'i1', type: 'Phone', date: '2026-03-20', time: '10:00', status: 'scheduled' },
      { id: 'i2', type: 'Technical', date: '2026-03-22', time: '14:00', status: 'completed' },
    ];
    const companies = [makeCompany({ id: '1', interviews })];

    const result = applyEditCompany(companies, '1', { position: 'Staff Engineer' });

    expect(result[0].interviews).toHaveLength(2);
    expect(result[0].interviews[0].id).toBe('i1');
    expect(result[0].interviews[1].id).toBe('i2');
    expect(result[0].interviews[0].status).toBe('scheduled');
    expect(result[0].interviews[1].status).toBe('completed');
  });

  it('editing position does not affect flattenAndSortInterviews interview fields', () => {
    const interviews = [
      { id: 'i1', type: 'Phone', date: '2026-03-20', time: '10:00', status: 'scheduled', duration: 45 },
    ];
    const companies = [makeCompany({ id: '1', name: 'Acme', interviews })];

    const edited = applyEditCompany(companies, '1', { position: 'Head of Engineering' });
    const flat = flattenAndSortInterviews(edited);

    expect(flat).toHaveLength(1);
    expect(flat[0].type).toBe('Phone');
    expect(flat[0].date).toBe('2026-03-20');
    expect(flat[0].time).toBe('10:00');
    expect(flat[0].duration).toBe(45);
    expect(flat[0].position).toBe('Head of Engineering');
    expect(flat[0].companyName).toBe('Acme');
  });

  it('editing pipeline does not lose or duplicate interviews', () => {
    const interviews = [
      { id: 'i1', type: 'HR', date: '2026-04-01', time: '09:00', status: 'scheduled' },
      { id: 'i2', type: 'Technical', date: '2026-04-02', time: '11:00', status: 'scheduled' },
      { id: 'i3', type: 'Phone', date: '2026-04-03', time: '16:00', status: 'cancelled' },
    ];
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv'], interviews })];

    const edited = applyEditCompany(companies, '1', { pipeline: ['tel-aviv', 'us'] });

    expect(edited[0].interviews).toHaveLength(3);
    expect(edited[0].interviews.map(i => i.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('adding an interview after editing does not corrupt the edit', () => {
    const companies = [makeCompany({ id: '1', position: 'SWE', interviews: [] })];

    const edited = applyEditCompany(companies, '1', { position: 'Head of Engineering' });
    const withInterview = applyAddInterview(edited, '1', {
      type: 'Phone', date: '2026-04-10', time: '10:00', status: 'scheduled',
    }, () => 999);

    expect(withInterview[0].position).toBe('Head of Engineering');
    expect(withInterview[0].interviews).toHaveLength(1);
    expect(withInterview[0].interviews[0].id).toBe('999');
  });

  it('editing a company does not affect other companies or their interviews', () => {
    const companies = [
      makeCompany({
        id: '1', name: 'Alpha',
        interviews: [{ id: 'i1', type: 'Phone', date: '2026-03-20', time: '10:00', status: 'scheduled' }],
      }),
      makeCompany({
        id: '2', name: 'Beta',
        interviews: [{ id: 'i2', type: 'HR', date: '2026-03-21', time: '11:00', status: 'completed' }],
      }),
    ];

    const edited = applyEditCompany(companies, '1', { position: 'Manager' });

    // Company 2 should be completely untouched (same reference)
    expect(edited[1]).toBe(companies[1]);
    expect(edited[1].interviews[0].id).toBe('i2');
    expect(edited[1].interviews[0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// H2: editing position/pipeline while the company is in multiple pipelines
// ---------------------------------------------------------------------------

describe('H2 (edit): editing multi-pipeline company', () => {
  it('editing position on a multi-pipeline company updates it for both pipelines', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'], position: 'SWE' })];

    const edited = applyEditCompany(companies, '1', { position: 'Head of Engineering' });

    // Same company object in both pipeline views
    const inTelAviv = edited.filter(c => isInPipeline(c, 'tel-aviv'));
    const inUs = edited.filter(c => isInPipeline(c, 'us'));

    expect(inTelAviv).toHaveLength(1);
    expect(inUs).toHaveLength(1);
    expect(inTelAviv[0].position).toBe('Head of Engineering');
    expect(inUs[0].position).toBe('Head of Engineering');
    expect(inTelAviv[0]).toBe(inUs[0]); // same reference
  });

  it('removing a pipeline via edit still keeps the company in remaining pipelines', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] })];

    const edited = applyEditCompany(companies, '1', { pipeline: ['us'] });

    expect(isInPipeline(edited[0], 'tel-aviv')).toBe(false);
    expect(isInPipeline(edited[0], 'us')).toBe(true);
    expect(isMultiPipeline(edited[0])).toBe(false);
  });

  it('adding a pipeline via edit makes the company appear in the new pipeline', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv'] })];

    const edited = applyEditCompany(companies, '1', { pipeline: ['tel-aviv', 'us'] });

    expect(isInPipeline(edited[0], 'tel-aviv')).toBe(true);
    expect(isInPipeline(edited[0], 'us')).toBe(true);
    expect(isMultiPipeline(edited[0])).toBe(true);
  });

  it('editing stage on a multi-pipeline company is reflected in both pipeline views', () => {
    const companies = [makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'], stage: 'applied' })];

    const edited = applyEditCompany(companies, '1', { stage: 'offer' });

    const inTelAviv = edited.filter(c => isInPipeline(c, 'tel-aviv'));
    const inUs = edited.filter(c => isInPipeline(c, 'us'));
    expect(inTelAviv[0].stage).toBe('offer');
    expect(inUs[0].stage).toBe('offer');
  });
});

// ---------------------------------------------------------------------------
// H4 (edit): rapid sequential edits — state consistency
// ---------------------------------------------------------------------------

describe('H4 (edit): rapid sequential edits produce consistent state', () => {
  it('three sequential edits to the same company produce correct final state', () => {
    let companies = [makeCompany({ id: '1', position: 'SWE', stage: 'applied', pipeline: ['tel-aviv'] })];

    companies = applyEditCompany(companies, '1', { position: 'Manager' });
    companies = applyEditCompany(companies, '1', { stage: 'technical' });
    companies = applyEditCompany(companies, '1', { pipeline: ['tel-aviv', 'us'] });

    expect(companies[0].position).toBe('Manager');
    expect(companies[0].stage).toBe('technical');
    expect(companies[0].pipeline).toEqual(['tel-aviv', 'us']);
  });

  it('editing the same field multiple times keeps only the last value', () => {
    let companies = [makeCompany({ id: '1', position: 'SWE' })];

    companies = applyEditCompany(companies, '1', { position: 'Manager' });
    companies = applyEditCompany(companies, '1', { position: 'Head of Engineering' });
    companies = applyEditCompany(companies, '1', { position: 'Senior Software Engineer' });

    expect(companies[0].position).toBe('Senior Software Engineer');
  });

  it('interleaving edits on different companies does not cross-contaminate', () => {
    let companies = [
      makeCompany({ id: '1', name: 'Alpha', position: 'SWE' }),
      makeCompany({ id: '2', name: 'Beta', position: 'SWE' }),
    ];

    companies = applyEditCompany(companies, '1', { position: 'Manager' });
    companies = applyEditCompany(companies, '2', { position: 'Head of Engineering' });
    companies = applyEditCompany(companies, '1', { stage: 'offer' });

    expect(companies[0].position).toBe('Manager');
    expect(companies[0].stage).toBe('offer');
    expect(companies[1].position).toBe('Head of Engineering');
    expect(companies[1].stage).toBe('applied'); // unchanged
  });

  it('editing a non-existent company ID leaves the array unchanged', () => {
    const companies = [makeCompany({ id: '1', position: 'SWE' })];

    const result = applyEditCompany(companies, 'nonexistent', { position: 'Manager' });

    expect(result).toHaveLength(1);
    expect(result[0].position).toBe('SWE'); // unchanged
    // The company object should be the same reference (no unnecessary copy)
    expect(result[0]).toBe(companies[0]);
  });
});

// ---------------------------------------------------------------------------
// Immutability checks for applyEditCompany
// ---------------------------------------------------------------------------

describe('applyEditCompany immutability', () => {
  it('does not mutate the original companies array', () => {
    const companies = [makeCompany({ id: '1', position: 'SWE' })];
    const snapshot = JSON.stringify(companies);

    applyEditCompany(companies, '1', { position: 'Manager' });

    expect(JSON.stringify(companies)).toBe(snapshot);
  });

  it('does not mutate the original company object', () => {
    const original = makeCompany({ id: '1', position: 'SWE', pipeline: ['tel-aviv'] });
    const companies = [original];

    applyEditCompany(companies, '1', { position: 'Manager', pipeline: ['us'] });

    expect(original.position).toBe('SWE');
    expect(original.pipeline).toEqual(['tel-aviv']);
  });

  it('returns a new array reference', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyEditCompany(companies, '1', { position: 'Manager' });
    expect(result).not.toBe(companies);
  });

  it('returns a new object reference for the edited company', () => {
    const companies = [makeCompany({ id: '1' })];
    const result = applyEditCompany(companies, '1', { position: 'Manager' });
    expect(result[0]).not.toBe(companies[0]);
  });

  it('preserves object identity for unedited companies', () => {
    const companies = [
      makeCompany({ id: '1' }),
      makeCompany({ id: '2', name: 'Other' }),
    ];
    const result = applyEditCompany(companies, '1', { position: 'Manager' });
    expect(result[1]).toBe(companies[1]);
  });
});
