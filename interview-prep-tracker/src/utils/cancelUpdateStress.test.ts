/**
 * Stress tests for the cancel/update suggestion feature.
 *
 * Each describe block targets a specific hypothesis about what could break.
 * Tests exercise edge cases, boundary conditions, and race-adjacent scenarios
 * in the pure utility functions and matching logic.
 */

import type { Company, Interview } from '../types';
import {
  matchSuggestionToInterview,
  applyInterviewUpdate,
  applyInterviewStatusUpdate,
} from './companyUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides: Record<string, unknown> = {}): Company {
  return {
    id: 'c1',
    name: 'Google',
    position: 'SWE',
    stage: 'applied',
    pipeline: ['tel-aviv'],
    interviews: [],
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as Company;
}

function makeInterview(overrides: Record<string, unknown> = {}): Interview {
  return {
    id: 'i1',
    type: 'Video Interview',
    date: '2025-01-20',
    time: '14:00',
    status: 'scheduled',
    ...overrides,
  } as unknown as Interview;
}

// ---------------------------------------------------------------------------
// H1: normalizeForMatch — character divergence stress
// ---------------------------------------------------------------------------

describe('H1 — normalizeForMatch edge cases in matchSuggestionToInterview', () => {
  it('matches company names with dots (e.g. "Check.Point" vs "CheckPoint")', () => {
    const companies = [
      makeCompany({ name: 'Check.Point', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'CheckPoint', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches company names with hyphens (e.g. "Coca-Cola" vs "CocaCola")', () => {
    const companies = [
      makeCompany({ name: 'Coca-Cola', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'CocaCola', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches when one side has "Inc" suffix and the other does not', () => {
    const companies = [
      makeCompany({ name: 'Acme Inc', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'Acme', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches when one side has "Ltd" suffix and the other does not', () => {
    const companies = [
      makeCompany({ name: 'Acme Ltd', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'acme', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches company names with underscores and spaces', () => {
    const companies = [
      makeCompany({ name: 'My_Company', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'My Company', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('matches when both sides have different casing and punctuation', () => {
    const companies = [
      makeCompany({ name: "O'Reilly Media", interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'oreilly media', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('does NOT match truly different companies despite normalization', () => {
    const companies = [
      makeCompany({ name: 'Google', interviews: [makeInterview()] }),
    ];
    const suggestion = { companyName: 'Meta', date: '2025-01-20', time: '14:00' };
    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H2: concurrent cancel + update for the same interview
// ---------------------------------------------------------------------------

describe('H2 — sequential cancel then update on the same interview', () => {
  it('cancel first: interview becomes cancelled, update match returns null', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '14:00', status: 'scheduled' })],
      }),
    ];

    // Step 1: Accept cancel — marks interview as cancelled
    const afterCancel = applyInterviewStatusUpdate(companies, 'c1', 'i1', 'cancelled');
    expect(afterCancel[0]!.interviews[0]!.status).toBe('cancelled');

    // Step 2: Try to match an update suggestion on the same interview
    const updateSuggestion = { companyName: 'Google', date: '2025-01-20', time: '15:00' };
    const match = matchSuggestionToInterview(afterCancel, updateSuggestion);

    // Should return null because cancelled interviews are skipped
    expect(match).toBeNull();
  });

  it('update first: interview date changes, cancel still matches by new date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '14:00', status: 'scheduled' })],
      }),
    ];

    // Step 1: Accept update — changes date
    const afterUpdate = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-01-25', time: '15:00' });
    expect(afterUpdate[0]!.interviews[0]!.date).toBe('2025-01-25');

    // Step 2: Try to match a cancel suggestion with the NEW date
    const cancelSuggestion = { companyName: 'Google', date: '2025-01-25', time: '15:00' };
    const match = matchSuggestionToInterview(afterUpdate, cancelSuggestion);

    expect(match).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('update first: cancel with OLD date fails to match (date changed)', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '14:00', status: 'scheduled' })],
      }),
    ];

    // Step 1: Accept update — changes date
    const afterUpdate = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-01-25', time: '15:00' });

    // Step 2: Try to match a cancel suggestion with the OLD date
    const cancelSuggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    const match = matchSuggestionToInterview(afterUpdate, cancelSuggestion);

    // Should return null because the interview's date changed
    expect(match).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H3: update flow preserves matchedInterview's companyId
// ---------------------------------------------------------------------------

describe('H3 — applyInterviewUpdate targets correct company regardless of other companies', () => {
  it('updates only the matched company when multiple companies exist', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00' })],
      }),
      makeCompany({
        id: 'c2',
        name: 'Meta',
        interviews: [makeInterview({ id: 'i2', date: '2025-01-20', time: '14:00' })],
      }),
    ];

    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-01-25', time: '11:00' });

    // c1 updated
    expect(result[0]!.interviews[0]!.date).toBe('2025-01-25');
    expect(result[0]!.interviews[0]!.time).toBe('11:00');

    // c2 untouched
    expect(result[1]!.interviews[0]!.date).toBe('2025-01-20');
    expect(result[1]!.interviews[0]!.time).toBe('14:00');
  });

  it('update with non-existent companyId leaves all companies unchanged', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];

    const result = applyInterviewUpdate(companies, 'c999', 'i1', { date: '2025-02-01' });

    // Nothing changed
    expect(result[0]!.interviews[0]!.date).toBe('2025-01-20');
  });

  it('update with non-existent interviewId leaves interviews unchanged', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20' })],
      }),
    ];

    const result = applyInterviewUpdate(companies, 'c1', 'i999', { date: '2025-02-01' });

    expect(result[0]!.interviews[0]!.date).toBe('2025-01-20');
  });
});

// ---------------------------------------------------------------------------
// H4: cancelled interview re-match prevention
// ---------------------------------------------------------------------------

describe('H4 — matchSuggestionToInterview skips cancelled interviews consistently', () => {
  it('skips cancelled interview even when it is the only one', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', status: 'cancelled' })],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('skips cancelled interview but matches a scheduled one on the same date', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [
          makeInterview({ id: 'i1', date: '2025-01-20', time: '10:00', status: 'cancelled' }),
          makeInterview({ id: 'i2', date: '2025-01-20', time: '14:00', status: 'scheduled' }),
        ],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i2' });
  });

  it('matches a completed interview (not skipped)', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', status: 'completed' })],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    const result = matchSuggestionToInterview(companies, suggestion);
    expect(result).toEqual({ companyId: 'c1', interviewId: 'i1' });
  });

  it('returns null when all interviews for the date are cancelled', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [
          makeInterview({ id: 'i1', date: '2025-01-20', status: 'cancelled' }),
          makeInterview({ id: 'i2', date: '2025-01-20', status: 'cancelled' }),
        ],
      }),
    ];
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    expect(matchSuggestionToInterview(companies, suggestion)).toBeNull();
  });

  it('cancel → re-match cycle: after cancelling, subsequent match returns null', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        name: 'Google',
        interviews: [makeInterview({ id: 'i1', date: '2025-01-20', status: 'scheduled' })],
      }),
    ];

    // First match succeeds
    const suggestion = { companyName: 'Google', date: '2025-01-20', time: '14:00' };
    expect(matchSuggestionToInterview(companies, suggestion)).toEqual({ companyId: 'c1', interviewId: 'i1' });

    // Apply cancellation
    const afterCancel = applyInterviewStatusUpdate(companies, 'c1', 'i1', 'cancelled');

    // Second match fails
    expect(matchSuggestionToInterview(afterCancel, suggestion)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H5: duration handling in applyInterviewUpdate
// ---------------------------------------------------------------------------

describe('H5 — duration edge cases in applyInterviewUpdate', () => {
  it('includes duration=0 in updates (zero is a valid duration)', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1', duration: 60 })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { duration: 0 });
    expect(result[0]!.interviews[0]!.duration).toBe(0);
  });

  it('includes duration=null in updates (explicitly clearing duration)', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1', duration: 60 })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { duration: null as unknown as number });
    expect(result[0]!.interviews[0]!.duration).toBeNull();
  });

  it('does not add duration field when not included in updates', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1' })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });
    // duration should remain whatever it was (undefined in this case)
    expect(result[0]!.interviews[0]).not.toHaveProperty('duration');
  });

  it('preserves existing duration when updating other fields', () => {
    const companies = [
      makeCompany({
        id: 'c1',
        interviews: [makeInterview({ id: 'i1', duration: 45 })],
      }),
    ];
    const result = applyInterviewUpdate(companies, 'c1', 'i1', { date: '2025-02-01' });
    expect(result[0]!.interviews[0]!.duration).toBe(45);
  });
});
