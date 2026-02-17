import { STAGES, STAGE_LABELS } from './stages';
import { POSITIONS } from './positions';
import { INTERVIEW_TYPES } from './interviewTypes';
import { SYSTEM_DESIGN_QUESTIONS } from './questions';

// ---------------------------------------------------------------------------
// stages
// ---------------------------------------------------------------------------

describe('STAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(STAGES)).toBe(true);
    expect(STAGES.length).toBeGreaterThan(0);
  });

  it('contains only string values', () => {
    STAGES.forEach((s) => expect(typeof s).toBe('string'));
  });

  it('contains the expected stage keys in order', () => {
    expect(STAGES).toEqual(['interested', 'applied', 'phone', 'technical', 'final', 'offer']);
  });
});

describe('STAGE_LABELS', () => {
  it('has an entry for every stage key', () => {
    STAGES.forEach((key) => {
      expect(STAGE_LABELS).toHaveProperty(key);
    });
  });

  it('maps every key to a non-empty string label', () => {
    STAGES.forEach((key) => {
      expect(typeof STAGE_LABELS[key]).toBe('string');
      expect(STAGE_LABELS[key].length).toBeGreaterThan(0);
    });
  });

  it('uses "CV Screening" for the phone stage', () => {
    expect(STAGE_LABELS.phone).toBe('CV Screening');
  });
});

// ---------------------------------------------------------------------------
// positions
// ---------------------------------------------------------------------------

describe('POSITIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(POSITIONS)).toBe(true);
    expect(POSITIONS.length).toBeGreaterThan(0);
  });

  it('contains only non-empty strings', () => {
    POSITIONS.forEach((p) => {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate values', () => {
    expect(new Set(POSITIONS).size).toBe(POSITIONS.length);
  });
});

// ---------------------------------------------------------------------------
// interviewTypes
// ---------------------------------------------------------------------------

describe('INTERVIEW_TYPES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(INTERVIEW_TYPES)).toBe(true);
    expect(INTERVIEW_TYPES.length).toBeGreaterThan(0);
  });

  it('contains only non-empty strings', () => {
    INTERVIEW_TYPES.forEach((t) => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    });
  });

  it('includes the three core types', () => {
    expect(INTERVIEW_TYPES).toContain('Phone Interview');
    expect(INTERVIEW_TYPES).toContain('Video Interview');
    expect(INTERVIEW_TYPES).toContain('Office Interview');
  });

  it('has no duplicate values', () => {
    expect(new Set(INTERVIEW_TYPES).size).toBe(INTERVIEW_TYPES.length);
  });
});

// ---------------------------------------------------------------------------
// SYSTEM_DESIGN_QUESTIONS
// ---------------------------------------------------------------------------

describe('SYSTEM_DESIGN_QUESTIONS', () => {
  it('is a plain object with at least one company key', () => {
    expect(typeof SYSTEM_DESIGN_QUESTIONS).toBe('object');
    expect(Object.keys(SYSTEM_DESIGN_QUESTIONS).length).toBeGreaterThan(0);
  });

  it('has at least one question per company', () => {
    Object.entries(SYSTEM_DESIGN_QUESTIONS).forEach(([company, questions]) => {
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
    });
  });

  it('every question has id, title, url, and difficulty fields', () => {
    Object.values(SYSTEM_DESIGN_QUESTIONS).flat().forEach((q) => {
      expect(typeof q.id).toBe('string');
      expect(typeof q.title).toBe('string');
      expect(typeof q.url).toBe('string');
      expect(typeof q.difficulty).toBe('string');
    });
  });

  it('all question ids are unique across all companies', () => {
    const allIds = Object.values(SYSTEM_DESIGN_QUESTIONS).flat().map((q) => q.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('all question difficulties are one of Hard, Medium, or Easy', () => {
    const valid = new Set(['Hard', 'Medium', 'Easy']);
    Object.values(SYSTEM_DESIGN_QUESTIONS).flat().forEach((q) => {
      expect(valid.has(q.difficulty)).toBe(true);
    });
  });
});
