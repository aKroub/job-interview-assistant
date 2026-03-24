import { renderHook, act } from '@testing-library/react';
import { useInterviewTracker } from './useInterviewTracker';
import { createMemoryStorage } from '../services/storageService';
import type { CompanyDraft } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  const storage = createMemoryStorage();
  const { result } = renderHook(() => useInterviewTracker(storage));
  return { result, storage };
}

const DRAFT: CompanyDraft = { name: 'Acme', position: 'Eng', stage: 'applied', pipeline: ['tel-aviv'] };

// ---------------------------------------------------------------------------
// API shape — verifies composition of useCompanies + useSeenQuestions
// ---------------------------------------------------------------------------

describe('useInterviewTracker — API shape', () => {
  it('exposes all companies-related methods', () => {
    const { result } = setup();
    expect(typeof result.current.companies).toBe('object');
    expect(typeof result.current.addCompany).toBe('function');
    expect(typeof result.current.updateCompanyStage).toBe('function');
    expect(typeof result.current.deleteCompany).toBe('function');
    expect(typeof result.current.addInterview).toBe('function');
    expect(typeof result.current.updateInterviewStatus).toBe('function');
  });

  it('exposes all seen-questions-related methods', () => {
    const { result } = setup();
    expect(result.current.seenQuestions instanceof Set).toBe(true);
    expect(typeof result.current.markQuestionSeen).toBe('function');
    expect(typeof result.current.resetCompanyQuestionsFor).toBe('function');
    expect(typeof result.current.getAvailableQuestionsFor).toBe('function');
    expect(typeof result.current.getTotalSeenFor).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Shared storage — both sub-hooks read/write to the same backing store
// ---------------------------------------------------------------------------

describe('useInterviewTracker — shared storage', () => {
  it('companies state starts empty', () => {
    const { result } = setup();
    expect(result.current.companies).toEqual([]);
  });

  it('seenQuestions starts as an empty Set', () => {
    const { result } = setup();
    expect(result.current.seenQuestions.size).toBe(0);
  });

  it('addCompany persists to the injected storage', () => {
    const { result, storage } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    const stored = JSON.parse(storage.getItem('companies')!);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.name).toBe('Acme');
  });

  it('markQuestionSeen persists to the injected storage', () => {
    const { result, storage } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    const stored = JSON.parse(storage.getItem('seenQuestions')!);
    expect(stored).toContain('g1');
  });

  it('companies and questions use separate storage keys', () => {
    const { result, storage } = setup();
    act(() => { result.current.addCompany(DRAFT); });
    act(() => { result.current.markQuestionSeen('g1'); });

    // Each key is independently parseable
    expect(() => JSON.parse(storage.getItem('companies')!)).not.toThrow();
    expect(() => JSON.parse(storage.getItem('seenQuestions')!)).not.toThrow();
    // And they don't overwrite each other
    expect(JSON.parse(storage.getItem('companies')!)[0]!.name).toBe('Acme');
    expect(JSON.parse(storage.getItem('seenQuestions')!)).toContain('g1');
  });
});

// ---------------------------------------------------------------------------
// End-to-end flows through the composed hook
// ---------------------------------------------------------------------------

describe('useInterviewTracker — end-to-end flows', () => {
  it('full company lifecycle: add → update stage → delete', () => {
    const { result } = setup();

    act(() => { result.current.addCompany({ name: 'Google', position: 'SWE', stage: 'applied' as const, pipeline: ['tel-aviv' as const] }); });
    const id = result.current.companies[0]!.id;

    act(() => { result.current.updateCompanyStage(id, 'technical'); });
    expect(result.current.companies[0]!.stage).toBe('technical');

    act(() => { result.current.deleteCompany(id); });
    expect(result.current.companies).toHaveLength(0);
  });

  it('full interview lifecycle: add → update status', () => {
    const { result } = setup();

    act(() => { result.current.addCompany({ name: 'Meta', position: 'SWE', stage: 'applied' as const, pipeline: ['tel-aviv' as const] }); });
    const companyId = result.current.companies[0]!.id;

    const interview = { type: 'Phone Interview' as const, date: '2025-01-01', time: '10:00', status: 'scheduled' as const };
    act(() => { result.current.addInterview(companyId, interview); });
    const interviewId = result.current.companies[0]!.interviews[0]!.id;

    act(() => { result.current.updateInterviewStatus(companyId, interviewId, 'completed'); });
    expect(result.current.companies[0]!.interviews[0]!.status).toBe('completed');
  });

  it('full question lifecycle: mark seen → getTotalSeen → reset', () => {
    const { result } = setup();

    act(() => { result.current.markQuestionSeen('g1'); });
    expect(result.current.getTotalSeenFor('Google')).toBe(1);

    act(() => { result.current.resetCompanyQuestionsFor('Google'); });
    expect(result.current.getTotalSeenFor('Google')).toBe(0);
  });
});
