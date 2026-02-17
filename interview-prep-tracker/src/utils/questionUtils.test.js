import {
  getAvailableQuestions,
  getTotalSeen,
  addSeenQuestion,
  resetCompanyQuestions,
} from './questionUtils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_QUESTIONS = {
  Google: [
    { id: 'g1', title: 'Design YouTube',      difficulty: 'Hard',   url: 'https://example.com/g1' },
    { id: 'g2', title: 'Design Google Drive', difficulty: 'Hard',   url: 'https://example.com/g2' },
    { id: 'g3', title: 'Design Gmail',        difficulty: 'Medium', url: 'https://example.com/g3' },
    { id: 'g4', title: 'Design Maps',         difficulty: 'Hard',   url: 'https://example.com/g4' },
  ],
  Facebook: [
    { id: 'f1', title: 'Design News Feed',  difficulty: 'Hard',   url: 'https://example.com/f1' },
    { id: 'f2', title: 'Design Messenger',  difficulty: 'Hard',   url: 'https://example.com/f2' },
  ],
};

// ---------------------------------------------------------------------------
// getAvailableQuestions
// ---------------------------------------------------------------------------

describe('getAvailableQuestions', () => {
  it('returns unseen questions up to the default limit of 3', () => {
    const seen = new Set();
    const result = getAvailableQuestions(MOCK_QUESTIONS, seen, 'Google');
    expect(result).toHaveLength(3);
  });

  it('excludes questions the user has already seen', () => {
    const seen = new Set(['g1', 'g2']);
    const result = getAvailableQuestions(MOCK_QUESTIONS, seen, 'Google');
    expect(result.map((q) => q.id)).not.toContain('g1');
    expect(result.map((q) => q.id)).not.toContain('g2');
  });

  it('respects a custom limit', () => {
    const seen = new Set();
    const result = getAvailableQuestions(MOCK_QUESTIONS, seen, 'Google', 2);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all questions are seen', () => {
    const seen = new Set(['g1', 'g2', 'g3', 'g4']);
    const result = getAvailableQuestions(MOCK_QUESTIONS, seen, 'Google');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for an unknown company', () => {
    const result = getAvailableQuestions(MOCK_QUESTIONS, new Set(), 'Amazon');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTotalSeen
// ---------------------------------------------------------------------------

describe('getTotalSeen', () => {
  it('returns 0 when nothing has been seen', () => {
    expect(getTotalSeen(MOCK_QUESTIONS, new Set(), 'Google')).toBe(0);
  });

  it('counts only questions belonging to the specified company', () => {
    // g1 belongs to Google; f1 belongs to Facebook
    const seen = new Set(['g1', 'f1']);
    expect(getTotalSeen(MOCK_QUESTIONS, seen, 'Google')).toBe(1);
  });

  it('returns the full count when all questions have been seen', () => {
    const seen = new Set(['g1', 'g2', 'g3', 'g4']);
    expect(getTotalSeen(MOCK_QUESTIONS, seen, 'Google')).toBe(4);
  });

  it('returns 0 for an unknown company', () => {
    expect(getTotalSeen(MOCK_QUESTIONS, new Set(['g1']), 'Amazon')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addSeenQuestion
// ---------------------------------------------------------------------------

describe('addSeenQuestion', () => {
  it('returns a new Set with the question id added', () => {
    const original = new Set(['g1']);
    const result = addSeenQuestion(original, 'g2');
    expect(result.has('g2')).toBe(true);
  });

  it('does not mutate the original Set', () => {
    const original = new Set(['g1']);
    addSeenQuestion(original, 'g2');
    expect(original.has('g2')).toBe(false);
  });

  it('preserves existing entries', () => {
    const original = new Set(['g1', 'g2']);
    const result = addSeenQuestion(original, 'g3');
    expect(result.has('g1')).toBe(true);
    expect(result.has('g2')).toBe(true);
    expect(result.has('g3')).toBe(true);
  });

  it('handles adding a duplicate id (set deduplication)', () => {
    const original = new Set(['g1']);
    const result = addSeenQuestion(original, 'g1');
    expect(result.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resetCompanyQuestions
// ---------------------------------------------------------------------------

describe('resetCompanyQuestions', () => {
  it('removes all question ids for the company from the seen set', () => {
    const seen = new Set(['g1', 'g2', 'f1']);
    const result = resetCompanyQuestions(seen, MOCK_QUESTIONS.Google);
    expect(result.has('g1')).toBe(false);
    expect(result.has('g2')).toBe(false);
  });

  it('preserves seen question ids for other companies', () => {
    const seen = new Set(['g1', 'f1']);
    const result = resetCompanyQuestions(seen, MOCK_QUESTIONS.Google);
    expect(result.has('f1')).toBe(true);
  });

  it('does not mutate the original Set', () => {
    const seen = new Set(['g1', 'g2']);
    resetCompanyQuestions(seen, MOCK_QUESTIONS.Google);
    expect(seen.has('g1')).toBe(true);
  });

  it('returns an empty set when input was only that company\'s questions', () => {
    const seen = new Set(['g1', 'g2', 'g3', 'g4']);
    const result = resetCompanyQuestions(seen, MOCK_QUESTIONS.Google);
    expect(result.size).toBe(0);
  });
});
