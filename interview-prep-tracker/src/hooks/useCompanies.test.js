import { renderHook, act } from '@testing-library/react';
import { useCompanies } from './useCompanies';
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

const DRAFT = { name: 'Google', position: 'SWE', stage: 'applied' };
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
