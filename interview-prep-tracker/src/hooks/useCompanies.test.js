import { renderHook, act } from '@testing-library/react';
import { useCompanies, isValidCompany } from './useCompanies';
import { createMemoryStorage } from '../services/storageService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a fresh in-memory storage and renders the hook against it. */
function setup() {
  const storage = createMemoryStorage();
  const { result } = renderHook(() => useCompanies(storage));
  return { result, storage };
}

const DRAFT = { name: 'Google', position: 'SWE', stage: 'applied', pipeline: ['tel-aviv'] };
const INTERVIEW = { type: 'Phone Screen', date: '2024-07-01', time: '10:00', status: 'scheduled' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useCompanies — initial state', () => {
  it('starts with an empty companies array', () => {
    const { result } = setup();
    expect(result.current.companies).toEqual([]);
  });

  it('loads persisted companies from storage on mount', () => {
    const storage = createMemoryStorage();
    const persisted = [{ id: '1', name: 'Meta', position: 'SWE', stage: 'phone', interviews: [], notes: '', createdAt: '' }];
    storage.setItem('companies', JSON.stringify(persisted));

    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies).toHaveLength(1);
    expect(result.current.companies[0].name).toBe('Meta');
  });
});

// ---------------------------------------------------------------------------
// addCompany
// ---------------------------------------------------------------------------

describe('useCompanies — addCompany', () => {
  it('adds a company to the list', () => {
    const { result } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    expect(result.current.companies).toHaveLength(1);
    expect(result.current.companies[0].name).toBe('Google');
  });

  it('persists the new company to storage', () => {
    const { result, storage } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const stored = JSON.parse(storage.getItem('companies'));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Google');
  });
});

// ---------------------------------------------------------------------------
// updateCompanyStage
// ---------------------------------------------------------------------------

describe('useCompanies — updateCompanyStage', () => {
  it('updates the stage of the specified company', () => {
    const { result } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const companyId = result.current.companies[0].id;

    act(() => { result.current.updateCompanyStage(companyId, 'technical'); });
    expect(result.current.companies[0].stage).toBe('technical');
  });
});

// ---------------------------------------------------------------------------
// deleteCompany
// ---------------------------------------------------------------------------

describe('useCompanies — deleteCompany', () => {
  it('removes the company from the list', () => {
    const { result } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const companyId = result.current.companies[0].id;

    act(() => { result.current.deleteCompany(companyId); });
    expect(result.current.companies).toHaveLength(0);
  });

  it('persists the deletion to storage', () => {
    const { result, storage } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const companyId = result.current.companies[0].id;

    act(() => { result.current.deleteCompany(companyId); });
    const stored = JSON.parse(storage.getItem('companies'));
    expect(stored).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addInterview
// ---------------------------------------------------------------------------

describe('useCompanies — addInterview', () => {
  it('appends an interview to the target company', () => {
    const { result } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const companyId = result.current.companies[0].id;

    act(() => { result.current.addInterview(companyId, INTERVIEW); });
    expect(result.current.companies[0].interviews).toHaveLength(1);
    expect(result.current.companies[0].interviews[0].type).toBe('Phone Screen');
  });
});

// ---------------------------------------------------------------------------
// updateInterviewStatus
// ---------------------------------------------------------------------------

describe('useCompanies — updateInterviewStatus', () => {
  it('updates the status of the specified interview', () => {
    const { result } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const companyId = result.current.companies[0].id;

    act(() => { result.current.addInterview(companyId, INTERVIEW); });
    const interviewId = result.current.companies[0].interviews[0].id;

    act(() => { result.current.updateInterviewStatus(companyId, interviewId, 'completed'); });
    expect(result.current.companies[0].interviews[0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// isValidCompany — pure validator
// ---------------------------------------------------------------------------

describe('isValidCompany', () => {
  const valid = { id: '1', name: 'Acme', position: 'Eng', stage: 'applied', interviews: [] };

  it('returns true for a valid company object', () => {
    expect(isValidCompany(valid)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidCompany(null)).toBe(false);
  });

  it('returns false for a primitive', () => {
    expect(isValidCompany('string')).toBe(false);
    expect(isValidCompany(42)).toBe(false);
  });

  it('returns false when id is missing or not a string', () => {
    expect(isValidCompany({ ...valid, id: 1 })).toBe(false);
    expect(isValidCompany({ ...valid, id: undefined })).toBe(false);
  });

  it('returns false when name is missing or not a string', () => {
    expect(isValidCompany({ ...valid, name: null })).toBe(false);
  });

  it('returns false when position is missing or not a string', () => {
    expect(isValidCompany({ ...valid, position: 123 })).toBe(false);
  });

  it('returns false when stage is missing or not a string', () => {
    expect(isValidCompany({ ...valid, stage: false })).toBe(false);
  });

  it('returns false when interviews is not an array', () => {
    expect(isValidCompany({ ...valid, interviews: null })).toBe(false);
    expect(isValidCompany({ ...valid, interviews: 'oops' })).toBe(false);
  });

  it('accepts companies without a pipeline field (backwards compat)', () => {
    expect(isValidCompany(valid)).toBe(true);
  });

  it('accepts companies with a valid pipeline field', () => {
    expect(isValidCompany({ ...valid, pipeline: 'us' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useCompanies — storage resilience (invalid / corrupted data)
// ---------------------------------------------------------------------------

describe('useCompanies — storage resilience', () => {
  it('starts fresh when storage contains malformed JSON', () => {
    const storage = createMemoryStorage();
    storage.setItem('companies', '{ not valid json');
    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies).toEqual([]);
  });

  it('starts fresh when storage contains a non-array value', () => {
    const storage = createMemoryStorage();
    storage.setItem('companies', JSON.stringify({ foo: 'bar' }));
    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies).toEqual([]);
  });

  it('starts fresh when any company in the array has an invalid shape', () => {
    const storage = createMemoryStorage();
    const badData = [{ id: 1, name: 'Bad', position: 'Eng', stage: 'applied', interviews: [] }];
    storage.setItem('companies', JSON.stringify(badData));
    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies).toEqual([]);
  });

  it('loads valid data that passes shape checks', () => {
    const storage = createMemoryStorage();
    const goodData = [{ id: '1', name: 'Good Co', position: 'SWE', stage: 'applied', interviews: [] }];
    storage.setItem('companies', JSON.stringify(goodData));
    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// useCompanies — pipeline migration on load
// ---------------------------------------------------------------------------

describe('useCompanies — pipeline migration', () => {
  it('backfills pipeline on legacy companies loaded from storage', () => {
    const storage = createMemoryStorage();
    const legacy = [{ id: '1', name: 'Old Co', position: 'SWE', stage: 'applied', interviews: [] }];
    storage.setItem('companies', JSON.stringify(legacy));

    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies[0].pipeline).toEqual(['tel-aviv']);
  });

  it('migrates scalar string pipeline to array', () => {
    const storage = createMemoryStorage();
    const legacy = [{ id: '1', name: 'Old Co', position: 'SWE', stage: 'applied', pipeline: 'us', interviews: [] }];
    storage.setItem('companies', JSON.stringify(legacy));

    const { result } = renderHook(() => useCompanies(storage));
    expect(result.current.companies[0].pipeline).toEqual(['us']);
  });

  it('persists the migrated data back to storage', () => {
    const storage = createMemoryStorage();
    const legacy = [{ id: '1', name: 'Old Co', position: 'SWE', stage: 'applied', interviews: [] }];
    storage.setItem('companies', JSON.stringify(legacy));

    renderHook(() => useCompanies(storage));
    const stored = JSON.parse(storage.getItem('companies'));
    expect(stored[0].pipeline).toEqual(['tel-aviv']);
  });

  it('does not re-write storage when all companies already have array pipeline', () => {
    const storage = createMemoryStorage();
    const modern = [{ id: '1', name: 'New Co', position: 'SWE', stage: 'applied', pipeline: ['us'], interviews: [] }];
    const json = JSON.stringify(modern);
    storage.setItem('companies', json);

    renderHook(() => useCompanies(storage));
    // Storage value should be identical — no unnecessary write
    expect(storage.getItem('companies')).toBe(json);
  });

  it('backfills pipeline on legacy companies loaded via replaceCompanies (cloud restore)', () => {
    const storage = createMemoryStorage();
    const { result } = renderHook(() => useCompanies(storage));
    const cloudData = [{ id: '1', name: 'Cloud Co', position: 'SWE', stage: 'phone', interviews: [] }];

    act(() => { result.current.replaceCompanies(cloudData); });
    expect(result.current.companies[0].pipeline).toEqual(['tel-aviv']);
    const stored = JSON.parse(storage.getItem('companies'));
    expect(stored[0].pipeline).toEqual(['tel-aviv']);
  });
});
