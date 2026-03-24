import { renderHook, act } from '@testing-library/react';
import { useSeenQuestions } from './useSeenQuestions';
import { createMemoryStorage } from '../services/storageService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  const storage = createMemoryStorage();
  const { result } = renderHook(() => useSeenQuestions(storage));
  return { result, storage };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useSeenQuestions — initial state', () => {
  it('starts with an empty seenQuestions Set', () => {
    const { result } = setup();
    expect(result.current.seenQuestions.size).toBe(0);
  });

  it('loads persisted seen question ids from storage on mount', () => {
    const storage = createMemoryStorage();
    storage.setItem('seenQuestions', JSON.stringify(['g1', 'g2']));

    const { result } = renderHook(() => useSeenQuestions(storage));
    expect(result.current.seenQuestions.has('g1')).toBe(true);
    expect(result.current.seenQuestions.has('g2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// markQuestionSeen
// ---------------------------------------------------------------------------

describe('useSeenQuestions — markQuestionSeen', () => {
  it('adds the question id to seenQuestions', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    expect(result.current.seenQuestions.has('g1')).toBe(true);
  });

  it('persists the id to storage', () => {
    const { result, storage } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    const stored = JSON.parse(storage.getItem('seenQuestions')!);
    expect(stored).toContain('g1');
  });

  it('accumulates multiple seen question ids', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    act(() => { result.current.markQuestionSeen('g2'); });
    expect(result.current.seenQuestions.has('g1')).toBe(true);
    expect(result.current.seenQuestions.has('g2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetCompanyQuestionsFor
// ---------------------------------------------------------------------------

describe('useSeenQuestions — resetCompanyQuestionsFor', () => {
  it('removes all question ids for the given company', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    act(() => { result.current.markQuestionSeen('g2'); });
    act(() => { result.current.resetCompanyQuestionsFor('Google'); });

    expect(result.current.seenQuestions.has('g1')).toBe(false);
    expect(result.current.seenQuestions.has('g2')).toBe(false);
  });

  it('preserves seen ids for other companies', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });  // Google
    act(() => { result.current.markQuestionSeen('f1'); });  // Facebook
    act(() => { result.current.resetCompanyQuestionsFor('Google'); });

    expect(result.current.seenQuestions.has('f1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAvailableQuestionsFor
// ---------------------------------------------------------------------------

describe('useSeenQuestions — getAvailableQuestionsFor', () => {
  it('returns up to 3 unseen questions for a company', () => {
    const { result } = setup();
    const questions = result.current.getAvailableQuestionsFor('Google');
    expect(questions.length).toBeLessThanOrEqual(3);
    expect(questions.length).toBeGreaterThan(0);
  });

  it('excludes questions that have been marked seen', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    const questions = result.current.getAvailableQuestionsFor('Google');
    expect(questions.map((q) => q.id)).not.toContain('g1');
  });

  it('returns empty array for an unknown company', () => {
    const { result } = setup();
    expect(result.current.getAvailableQuestionsFor('Amazon')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTotalSeenFor
// ---------------------------------------------------------------------------

describe('useSeenQuestions — getTotalSeenFor', () => {
  it('returns 0 when nothing has been seen', () => {
    const { result } = setup();
    expect(result.current.getTotalSeenFor('Google')).toBe(0);
  });

  it('returns the count of seen questions for the given company', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('g1'); });
    act(() => { result.current.markQuestionSeen('g2'); });
    expect(result.current.getTotalSeenFor('Google')).toBe(2);
  });

  it('does not count questions from other companies', () => {
    const { result } = setup();
    act(() => { result.current.markQuestionSeen('f1'); }); // Facebook
    expect(result.current.getTotalSeenFor('Google')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useSeenQuestions — storage resilience (invalid / corrupted data)
// ---------------------------------------------------------------------------

describe('useSeenQuestions — storage resilience', () => {
  it('starts with empty set when storage contains malformed JSON', () => {
    const storage = createMemoryStorage();
    storage.setItem('seenQuestions', '{ bad json');
    const { result } = renderHook(() => useSeenQuestions(storage));
    expect(result.current.seenQuestions.size).toBe(0);
  });

  it('starts with empty set when storage contains a non-array', () => {
    const storage = createMemoryStorage();
    storage.setItem('seenQuestions', JSON.stringify({ id: 'g1' }));
    const { result } = renderHook(() => useSeenQuestions(storage));
    expect(result.current.seenQuestions.size).toBe(0);
  });

  it('starts with empty set when array contains non-string values', () => {
    const storage = createMemoryStorage();
    storage.setItem('seenQuestions', JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useSeenQuestions(storage));
    expect(result.current.seenQuestions.size).toBe(0);
  });

  it('loads valid string-only arrays from storage', () => {
    const storage = createMemoryStorage();
    storage.setItem('seenQuestions', JSON.stringify(['g1', 'g2']));
    const { result } = renderHook(() => useSeenQuestions(storage));
    expect(result.current.seenQuestions.has('g1')).toBe(true);
    expect(result.current.seenQuestions.has('g2')).toBe(true);
  });
});
